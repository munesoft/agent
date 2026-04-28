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
