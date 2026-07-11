"use strict";

const { BaseLLMAdapter, LLMError } = require("../llm/base");

class ModelRouter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.routes = [];
    this.maxFailures = opts.maxFailures ?? 2;
    this.cooldown = opts.cooldown ?? 30000;
    this._health = new Map();
    for (const route of opts.routes || []) this.add(route);
    if (opts.fallback) this.add({ name: "fallback", adapter: opts.fallback, priority: -Infinity });
  }
  add(route) {
    if (!route?.adapter) throw new ModelRouterError("Route requires an adapter");
    this.routes.push({ name: route.name || route.adapter.constructor?.name || "model", priority: route.priority ?? 0, when: route.when || null, adapter: route.adapter });
    this.routes.sort((a, b) => b.priority - a.priority);
    return this;
  }
  list() { return this.routes.map(route => ({ name: route.name, healthy: this._healthy(route.name), priority: route.priority })); }
  async complete(args) { return this._call("complete", args); }
  async functionCall(args) { return this._call("functionCall", args); }
  async *_stream(args) {
    const route = this._candidates(args)[0];
    if (!route) throw new ModelRouterError("No healthy model route available");
    if (typeof route.adapter.stream === "function") yield* route.adapter.stream(args);
    else yield await route.adapter.complete(args);
  }
  stream(args) { return this._stream(args); }
  async _call(method, args) {
    const errors = [];
    for (const route of this._candidates(args)) {
      if (typeof route.adapter[method] !== "function") continue;
      try {
        const result = await route.adapter[method](args);
        this._health.delete(route.name);
        return result;
      } catch (error) {
        errors.push({ route: route.name, error });
        const health = this._health.get(route.name) || { failures: 0, openedAt: 0 };
        health.failures++;
        if (health.failures >= this.maxFailures) health.openedAt = Date.now();
        this._health.set(route.name, health);
      }
    }
    const message = errors.map(item => item.route + ": " + item.error.message).join("; ") || "no route matched";
    throw new LLMError("All model routes failed - " + message);
  }
  _candidates(args) { return this.routes.filter(route => this._healthy(route.name) && (!route.when || route.when(args))); }
  _healthy(name) {
    const health = this._health.get(name);
    if (!health?.openedAt) return true;
    if (Date.now() - health.openedAt >= this.cooldown) { this._health.delete(name); return true; }
    return false;
  }
}

class ModelRouterError extends Error { constructor(message) { super(message); this.name = "ModelRouterError"; } }
module.exports = { ModelRouter, ModelRouterError };
