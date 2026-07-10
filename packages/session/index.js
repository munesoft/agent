"use strict";

/**
 * @munesoft/agent — Session Store (searchable episodic memory)
 *
 * Where MemoryLayer is a KV + history cache scoped to one run, SessionStore is the
 * long-lived, *searchable* record of what agents actually did: intent, decisions,
 * tools used, files touched, and outcomes — one record per run ("episode").
 *
 * Retrieval is tied to sessions/events and returns cited snippets + IDs (not just a
 * compact summary), so a later agent can recover *where a decision came from* before
 * repeating work. Ranking is BM25 over an in-memory inverted index; persistence is an
 * append-only JSONL log (rebuildable on startup). Zero dependencies.
 */

const K1 = 1.5;
const B  = 0.75;

// ── Tokenization ──────────────────────────────────────────────────────────────
const STOP = new Set(["the","a","an","to","of","in","on","for","and","or","is","it","this","that","with","was","were","be","as","at","by"]);

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter(t => t.length > 1 && !STOP.has(t));
}

// File paths get indexed as the full path plus each segment, so both
// "search --file crates/foo/lib.rs" and "search lib" can hit.
function pathTokens(p) {
  if (!p) return [];
  const norm = String(p).toLowerCase();
  return [norm, ...norm.split(/[\/\\.]+/g).filter(Boolean)];
}

let _counter = 0;
function makeId(prefix) {
  _counter = (_counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${_counter.toString(36).padStart(4, "0")}`;
}

class SessionStore {
  /**
   * @param {object} opts
   * @param {string} [opts.path]   JSONL file for persistence. Falsy => in-memory only.
   * @param {number} [opts.maxSnippet=160]
   * @param {boolean}[opts.debug]
   */
  constructor(opts = {}) {
    const path = require("path");
    this._path      = opts.path === undefined
      ? path.join(process.cwd(), ".agent-sessions", "index.jsonl")
      : opts.path;
    this._fs        = require("fs");
    this._maxSnippet= opts.maxSnippet || 160;
    this.debug      = opts.debug || false;

    this._docs      = new Map();   // id -> session record (+ _text, _tf, _len)
    this._df        = new Map();   // term -> # docs containing it
    this._fileIndex = new Map();   // fileToken -> Set<id>
    this._totalLen  = 0;

    if (this._path) this._loadFromDisk();
  }

  // ── Ingest ────────────────────────────────────────────────────────────────
  /**
   * Record one agent run as a searchable episode.
   * @param {object} s
   * @param {string} [s.sessionId]
   * @param {string} [s.agent]
   * @param {string} [s.task]         the natural-language task/input
   * @param {object|string} [s.intent]
   * @param {string[]} [s.decisions]  notable decisions / constraints / rejected approaches
   * @param {string[]} [s.toolsUsed]
   * @param {string[]} [s.filesTouched]
   * @param {string} [s.outcome]      "success" | "error" | free text
   * @param {string} [s.summary]
   * @param {object[]} [s.events]     raw lifecycle events (optional)
   * @returns {object} the stored record (with .id)
   */
  record(s = {}) {
    const id = s.id || makeId("ses");
    const rec = {
      id,
      sessionId:    s.sessionId    || id,
      ts:           s.ts           || new Date().toISOString(),
      agent:        s.agent        || "agent",
      task:         s.task         || "",
      intent:       s.intent       || null,
      decisions:    s.decisions    || [],
      toolsUsed:    s.toolsUsed    || [],
      filesTouched: (s.filesTouched|| []).map(String),
      outcome:      s.outcome      || "",
      summary:      s.summary      || "",
      events:       s.events       || [],
    };

    this._index(rec);
    if (this._path) this._appendToDisk(rec);
    if (this.debug) console.log(`[SessionStore] + ${id} (${rec.filesTouched.length} files)`);
    return rec;
  }

  _searchableText(rec) {
    const intentStr = typeof rec.intent === "string" ? rec.intent : JSON.stringify(rec.intent || "");
    return [
      rec.task,
      intentStr,
      rec.summary,
      rec.outcome,
      (rec.decisions || []).join(". "),
      (rec.toolsUsed || []).join(" "),
      (rec.filesTouched || []).join(" "),
    ].filter(Boolean).join("\n");
  }

  _index(rec) {
    const text   = this._searchableText(rec);
    const tokens = tokenize(text);
    const tf     = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

    rec._text = text;
    rec._tf   = tf;
    rec._len  = tokens.length || 1;

    this._docs.set(rec.id, rec);
    this._totalLen += rec._len;
    for (const term of tf.keys()) this._df.set(term, (this._df.get(term) || 0) + 1);

    for (const f of rec.filesTouched)
      for (const ft of pathTokens(f)) {
        if (!this._fileIndex.has(ft)) this._fileIndex.set(ft, new Set());
        this._fileIndex.get(ft).add(rec.id);
      }
  }

  // ── Search ────────────────────────────────────────────────────────────────
  /**
   * Rank prior sessions by relevance to a query. BM25 over the inverted index.
   * @param {string} query
   * @param {object} [opts]
   * @param {number} [opts.limit=5]
   * @param {string} [opts.file]     restrict to sessions that touched this file/path
   * @param {string[]}[opts.terms]   extra OR terms (e.g. ["rollback","migration"])
   * @returns {Array<{id,score,snippet,session}>} cited results
   */
  search(query, opts = {}) {
    const limit = opts.limit || 5;
    const qTokens = [...new Set([...tokenize(query), ...(opts.terms || []).flatMap(tokenize)])];
    if (!qTokens.length && !opts.file) return [];

    let candidateIds = null;
    if (opts.file) {
      candidateIds = new Set();
      for (const ft of pathTokens(opts.file))
        for (const id of (this._fileIndex.get(ft) || [])) candidateIds.add(id);
      if (!qTokens.length) {
        return [...candidateIds]
          .map(id => this._docs.get(id))
          .sort((a, b) => (a.ts < b.ts ? 1 : -1))
          .slice(0, limit)
          .map(rec => this._result(rec, rec.filesTouched[0] || "", 0));
      }
    }

    const N      = this._docs.size || 1;
    const avgdl  = this._totalLen / N || 1;
    const scored = [];

    const pool = candidateIds
      ? [...candidateIds].map(id => this._docs.get(id))
      : [...this._docs.values()];

    for (const rec of pool) {
      let score = 0;
      for (const term of qTokens) {
        const tf = rec._tf.get(term);
        if (!tf) continue;
        const df  = this._df.get(term) || 1;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        score += idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * rec._len / avgdl));
      }
      if (score > 0) scored.push({ rec, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ rec, score }) => this._result(rec, qTokens[0], score));
  }

  searchByFile(file, limit = 5) { return this.search("", { file, limit }); }

  _result(rec, focusTerm, score) {
    return {
      id:      rec.id,
      score:   Number(score.toFixed(4)),
      snippet: this._snippet(rec._text, focusTerm),
      session: this.get(rec.id, { withText: false }),
    };
  }

  _snippet(text, term) {
    if (!text) return "";
    const lc  = text.toLowerCase();
    let idx   = term ? lc.indexOf(term.toLowerCase()) : 0;
    if (idx < 0) idx = 0;
    const half  = Math.floor(this._maxSnippet / 2);
    const start = Math.max(0, idx - half);
    const end   = Math.min(text.length, idx + half);
    return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
  }

  // ── Access ──────────────────────────────────────────────────────────────
  get(id, { withText = true } = {}) {
    const rec = this._docs.get(id);
    if (!rec) return null;
    const { _text, _tf, _len, ...clean } = rec;
    return withText ? { ...clean, text: _text } : clean;
  }

  recent(n = 10) {
    return [...this._docs.values()]
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))
      .slice(0, n)
      .map(r => this.get(r.id, { withText: false }));
  }

  stats() {
    return { sessions: this._docs.size, uniqueTerms: this._df.size, indexedFiles: this._fileIndex.size };
  }

  // ── Persistence (append-only JSONL) ────────────────────────────────────────
  _appendToDisk(rec) {
    const path = require("path");
    const dir  = path.dirname(this._path);
    try { this._fs.mkdirSync(dir, { recursive: true }); } catch {}
    const { _text, _tf, _len, ...clean } = rec;
    this._fs.appendFileSync(this._path, JSON.stringify(clean) + "\n");
  }

  _loadFromDisk() {
    let raw;
    try { raw = this._fs.readFileSync(this._path, "utf8"); } catch { return; }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try { this._index(JSON.parse(line)); } catch {}
    }
    if (this.debug) console.log(`[SessionStore] loaded ${this._docs.size} sessions from ${this._path}`);
  }
}

class SessionStoreError extends Error { constructor(m) { super(m); this.name = "SessionStoreError"; } }

module.exports = { SessionStore, SessionStoreError, tokenize };
