"use strict";

class TraceCollector {
  constructor(opts = {}) {
    this.serviceName = opts.serviceName || "munesoft-agent";
    this.maxEvents = opts.maxEvents ?? 5000;
    this.events = [];
    this.spans = [];
    this.usage = [];
    this._detach = null;
  }
  attach(target) {
    this.detach();
    const bus = target?.events || target;
    if (!bus?.on) throw new TraceError("TraceCollector requires an Agent or EventBus");
    this._detach = bus.on("*", event => this.record(event.event, event));
    return () => this.detach();
  }
  detach() { if (this._detach) this._detach(); this._detach = null; return this; }
  record(name, attributes = {}) {
    this.events.push({ name, attributes, timestamp: new Date().toISOString() });
    if (this.events.length > this.maxEvents) this.events.shift();
    return this;
  }
  startSpan(name, attributes = {}) {
    const span = { id: Math.random().toString(36).slice(2), name, attributes, startTime: Date.now(), endTime: null, duration: null, status: "running" };
    this.spans.push(span);
    return { end: (status = "ok", extra = {}) => { span.endTime = Date.now(); span.duration = span.endTime - span.startTime; span.status = status; Object.assign(span.attributes, extra); return span; }, span };
  }
  recordUsage(usage = {}) { this.usage.push({ ...usage, timestamp: new Date().toISOString() }); return this; }
  summary() {
    return {
      events: this.events.length,
      spans: this.spans.length,
      inputTokens: sum(this.usage, "inputTokens"),
      outputTokens: sum(this.usage, "outputTokens"),
      cost: sum(this.usage, "cost"),
    };
  }
  exportOTLP() {
    return { resource: { attributes: { "service.name": this.serviceName } }, spans: this.spans.map(span => ({ traceId: span.id, name: span.name, startTimeUnixMs: span.startTime, endTimeUnixMs: span.endTime, status: span.status, attributes: span.attributes })), events: this.events };
  }
}

class Evaluator {
  constructor(opts = {}) { this.metrics = []; this.minScore = opts.minScore ?? 0.7; for (const metric of opts.metrics || []) this.add(metric); }
  add(metric) { if (typeof metric?.evaluate !== "function") throw new EvaluationError("Metric requires evaluate()"); this.metrics.push({ name: metric.name || "metric", weight: metric.weight ?? 1, evaluate: metric.evaluate }); return this; }
  async evaluate(input, output, context = {}) {
    const results = [];
    for (const metric of this.metrics) {
      const raw = await metric.evaluate({ input, output, context });
      const score = typeof raw === "number" ? raw : raw?.score ?? (raw === true ? 1 : 0);
      results.push({ name: metric.name, score: clamp(score), weight: metric.weight, reason: raw?.reason || null });
    }
    const weight = results.reduce((n, item) => n + item.weight, 0) || 1;
    const score = results.reduce((n, item) => n + item.score * item.weight, 0) / weight;
    return { passed: score >= this.minScore, score, results };
  }
}
function sum(items, key) { return items.reduce((total, item) => total + (Number(item[key]) || 0), 0); }
function clamp(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
class TraceError extends Error { constructor(message) { super(message); this.name = "TraceError"; } }
class EvaluationError extends Error { constructor(message) { super(message); this.name = "EvaluationError"; } }
module.exports = { TraceCollector, Evaluator, TraceError, EvaluationError };
