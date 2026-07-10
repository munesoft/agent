"use strict";

/**
 * @munesoft/logx integration — structured logs for the agent lifecycle.
 * Pipes an agent's EventBus into logx so every stage (intent, routing, execution,
 * verification, repair, errors) is emitted as a structured log line.
 * (logx ships an ESM build, so this adapter is async and lazy-imports it.)
 */
const { importDep, primary } = require("./_load");

/**
 * Attach logx to an agent (or a raw EventBus).
 * @param {object} target  an Agent (uses .events) or an EventBus
 * @param {object} [opts]
 *   @param {string[]} [opts.events]  only log these event names (default: all)
 *   @param {string}   [opts.prefix="agent"]
 * @returns {Promise<Function>} detach() to stop logging
 */
async function attachLogx(target, opts = {}) {
  const mod  = await importDep("@munesoft/logx", "attachLogx");
  const logx = primary(mod, "logx", "log");
  const bus  = target && target.events ? target.events : target;
  if (!bus || typeof bus.on !== "function") throw new Error("attachLogx: expected an Agent or EventBus");

  const prefix = opts.prefix || "agent";
  const only   = opts.events ? new Set(opts.events) : null;
  const levelOf = (event) => (event === "agent.error" ? "error" : event === "repair.attempt" ? "warn" : "info");

  return bus.on("*", (payload) => {
    const { event, ...rest } = payload || {};
    if (only && !only.has(event)) return;
    const fn = (logx && logx[levelOf(event)]) || logx;
    try { fn(`[${prefix}] ${event}`, rest); } catch { /* never let logging break a run */ }
  });
}

module.exports = { attachLogx };
