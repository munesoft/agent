"use strict";

/**
 * @munesoft/memoryx integration — semantic episodic memory as a drop-in search source.
 *
 * Returns an object with `.record()` + `.search()` matching the shape SessionStore
 * exposes, so it plugs straight into `makeRecallTool()` and
 * `createHistoryResearchAgent()` — but backed by memoryx (dedupe, importance,
 * compression, optional file/redis persistence) instead of the built-in BM25 index.
 */
const { requireDep, primary } = require("./_load");

/**
 * @param {object} [opts] memoryx options ({ ai, store, namespace, ... }) + { namespace }
 * @returns {{ memory:object, record:Function, search:Function }}
 */
function createMemoryxStore(opts = {}) {
  const mod = requireDep("@munesoft/memoryx", "createMemoryxStore");
  const factory = primary(mod, "memoryx");
  const mem = typeof factory === "function" ? factory(opts) : new mod.Memory(opts);
  const ns = opts.namespace || "sessions";

  const toText = (s) => [
    s.task, (s.decisions || []).join(". "), (s.toolsUsed || []).join(" "),
    (s.filesTouched || []).join(" "), s.outcome, s.summary,
  ].filter(Boolean).join("\n");

  return {
    memory: mem,

    /** Store one agent run/episode. Returns the record with its memoryx id. */
    async record(s = {}) {
      const id = await mem.remember(
        { ...s, text: toText(s) },
        { namespace: ns, tags: s.filesTouched || [], importance: s.outcome === "error" ? 0.9 : 0.5 });
      return { ...s, id };
    },

    /** Rank prior episodes by relevance — returns SessionStore-style cited hits. */
    async search(query, o = {}) {
      const hits = await mem.recall(query || "", { namespace: ns, limit: o.limit || 5, ...o });
      return (hits || []).map((h) => {
        const entry = h.entry || h;
        const data  = h.data || entry.data || {};
        return {
          id:      entry.id || h.id || "",
          score:   Number(h.score ?? entry.importance ?? 0),
          snippet: data.text || entry.text || h.snippet || "",
          session: data,
        };
      });
    },
  };
}

module.exports = { createMemoryxStore };
