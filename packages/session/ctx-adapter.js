"use strict";

/**
 * @munesoft/agent — ctx adapter
 *
 * Optional bridge to the `ctx` CLI (https://github.com/ctxrs/ctx). Where SessionStore
 * indexes *your framework's own* runs, CtxAdapter searches the real persisted history
 * of coding-agent harnesses (Claude Code, Codex, Cursor, …) that ctx has indexed on the
 * machine. Same `.search()` shape as SessionStore, so it's a drop-in source for
 * makeRecallTool() and createHistoryResearchAgent().
 *
 * Requires the `ctx` binary on PATH (curl -fsSL https://ctx.rs/install | sh).
 * Degrades gracefully: if ctx is missing, .available() is false and .search() returns [].
 */

const { spawnSync } = require("child_process");

class CtxAdapter {
  constructor(opts = {}) {
    this._bin   = opts.bin || "ctx";
    this.debug  = opts.debug || false;
    this._ok    = null; // cached availability
  }

  available() {
    if (this._ok !== null) return this._ok;
    const r = spawnSync(this._bin, ["--version"], { encoding: "utf8" });
    this._ok = !r.error && r.status === 0;
    return this._ok;
  }

  /**
   * @param {string} query
   * @param {object} [opts] { limit, file, terms }
   * @returns {Promise<Array<{id,score,snippet,session}>>}
   */
  async search(query, opts = {}) {
    if (!this.available()) {
      if (this.debug) console.warn("[CtxAdapter] `ctx` not found on PATH — returning no results");
      return [];
    }
    const args = ["search", "--json"];
    if (opts.file) args.push("--file", opts.file);
    if (opts.terms) for (const t of opts.terms) args.push("--term", t);
    if (query) args.push(query);

    const r = spawnSync(this._bin, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    if (r.status !== 0) {
      if (this.debug) console.warn("[CtxAdapter] ctx search failed:", r.stderr);
      return [];
    }

    let parsed;
    try { parsed = JSON.parse(r.stdout); } catch { return []; }
    const rows = Array.isArray(parsed) ? parsed : (parsed.results || parsed.matches || []);
    const limit = opts.limit || 5;

    return rows.slice(0, limit).map(row => ({
      id:      row.event_id || row.session_id || row.id || "ctx",
      score:   row.score || 0,
      snippet: row.snippet || row.text || "",
      session: {
        id:           row.session_id || row.id,
        provider:     row.provider,
        outcome:      row.outcome || "",
        filesTouched: row.files || row.touched_files || [],
        decisions:    [],
      },
    }));
  }

  /** Recover a full event/session transcript by ctx ID (for deep dives). */
  show(kind, id, window = 3) {
    if (!this.available()) return null;
    const r = spawnSync(this._bin, ["show", kind, id, "--window", String(window)], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    return r.status === 0 ? r.stdout : null;
  }
}

module.exports = { CtxAdapter };
