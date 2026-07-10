"use strict";

/**
 * @munesoft/idx integration — stable internal IDs.
 * Swap the framework's `Date.now()`-based IDs for collision-resistant idx IDs.
 */
const { requireDep, primary } = require("./_load");

function _idx() { return primary(requireDep("@munesoft/idx", "idFactory"), "idx"); }

/**
 * Build an ID factory backed by @munesoft/idx.
 * @param {{ length?: number, prefix?: string }} [opts]
 */
function idFactory(opts = {}) {
  const idx = _idx();
  const mod = requireDep("@munesoft/idx", "idFactory");
  const p = opts.prefix ? `${opts.prefix}_` : "";
  return {
    /** URL-safe random id (default length 12). */
    id:       (len) => p + idx(len ?? opts.length ?? 12),
    /** Time-sortable id. */
    time:     () => p + (idx.time ? idx.time() : (mod.timeId ? mod.timeId() : idx())),
    /** Human-readable id (adjective-noun-number). */
    readable: () => (idx.readable ? idx.readable() : (mod.readableId ? mod.readableId() : idx())),
  };
}

/**
 * Return a run-context patch that stamps a stable session id (using idx) when one
 * isn't already present — pass it as the `context` to `agent.run(input, context)`.
 */
function withStableIds(context = {}, opts = {}) {
  if (context.sessionId) return context;
  return { ...context, sessionId: idFactory({ prefix: "sess", ...opts }).time() };
}

module.exports = { idFactory, withStableIds };
