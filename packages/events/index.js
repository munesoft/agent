"use strict";

/**
 * @munesoft/agent — Event Bus
 * Lightweight pub/sub for agent lifecycle events.
 * Subscribe to: intent.parsed, tool.selected, tool.executed, memory.updated,
 *               agent.error, pipeline.step, workflow.node, agent.run
 */

class EventBus {
  constructor() {
    this._handlers = new Map();
    this._history  = [];
    this._maxHistory = 500;
  }

  /**
   * Subscribe to an event.
   * @param {string} event - Event name or "*" for all events
   * @param {Function} handler - (payload) => void
   * @returns {Function} unsubscribe function
   */
  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /** Subscribe once */
  once(event, handler) {
    const wrapper = (payload) => { handler(payload); this.off(event, wrapper); };
    return this.on(event, wrapper);
  }

  /** Unsubscribe */
  off(event, handler) {
    this._handlers.get(event)?.delete(handler);
    return this;
  }

  /** Emit an event */
  emit(event, payload = {}) {
    const entry = { event, payload, timestamp: new Date().toISOString() };
    if (this._history.length >= this._maxHistory) this._history.shift();
    this._history.push(entry);

    // Specific handlers
    this._handlers.get(event)?.forEach(h => { try { h(payload); } catch {} });
    // Wildcard handlers
    this._handlers.get("*")?.forEach(h => { try { h({ event, ...payload }); } catch {} });
  }

  /**
   * Emit an event and await every handler (handlers may be async).
   * Unlike emit(), rejections/throws are swallowed per-handler but all are awaited.
   */
  async emitAsync(event, payload = {}) {
    const entry = { event, payload, timestamp: new Date().toISOString() };
    if (this._history.length >= this._maxHistory) this._history.shift();
    this._history.push(entry);

    const run = async (h, arg) => { try { await h(arg); } catch {} };
    const jobs = [];
    this._handlers.get(event)?.forEach(h => jobs.push(run(h, payload)));
    this._handlers.get("*")?.forEach(h => jobs.push(run(h, { event, ...payload })));
    await Promise.all(jobs);
  }

  /**
   * Resolve the next time `event` fires (optionally matching a predicate).
   * @param {string} event
   * @param {{predicate?:(p:any)=>boolean, timeout?:number}} [opts]
   * @returns {Promise<any>} the event payload
   */
  waitFor(event, opts = {}) {
    const { predicate, timeout } = opts;
    return new Promise((resolve, reject) => {
      let timer = null;
      const off = this.on(event, (payload) => {
        if (predicate && !predicate(payload)) return;
        if (timer) clearTimeout(timer);
        off();
        resolve(payload);
      });
      if (timeout) timer = setTimeout(() => { off(); reject(new Error(`waitFor("${event}") timed out after ${timeout}ms`)); }, timeout);
    });
  }

  /** Get recent event history */
  history(event, limit = 50) {
    const all = event ? this._history.filter(e => e.event === event) : this._history;
    return all.slice(-limit);
  }

  /** Clear all handlers */
  clear() { this._handlers.clear(); return this; }
}

// Global singleton event bus (shared across agents unless overridden)
const globalBus = new EventBus();

module.exports = { EventBus, globalBus };
