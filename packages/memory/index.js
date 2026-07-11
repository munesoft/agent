"use strict";

class MemoryLayer {
  constructor(opts = {}) {
    this._short            = new Map();
    this._adapter          = opts.adapter          || null;
    this._maxItems         = opts.maxShortTermItems || 100;
    this._ttlMs            = opts.ttl              || null;
    this._ns               = opts.namespace ? `${opts.namespace}:` : "";
    this.debug             = opts.debug            || false;
  }

  _key(key) { return this._ns + key; }

  // ── Short-term ─────────────────────────────────────────────────────────────
  set(key, value) {
    const k = this._key(key);
    if (!this._short.has(k) && this._short.size >= this._maxItems) this._short.delete(this._short.keys().next().value);
    this._short.set(k, { value, timestamp: Date.now(), expiresAt: this._ttlMs ? Date.now() + this._ttlMs : null });
    return this;
  }

  get(key) {
    const k = this._key(key);
    const e = this._short.get(k);
    if (!e) return null;
    if (e.expiresAt && Date.now() > e.expiresAt) { this._short.delete(k); return null; }
    return e.value;
  }

  has(key)    { return this.get(key) !== null; }
  delete(key) { this._short.delete(this._key(key)); return this; }
  clear()     { this._short.clear(); return this; }

  /** Purge all expired entries. */
  sweep() {
    const now = Date.now();
    for (const [k, e] of this._short.entries()) if (e.expiresAt && now > e.expiresAt) this._short.delete(k);
    return this;
  }

  snapshot() {
    const r = {};
    const now = Date.now();
    for (const [k, e] of this._short.entries()) {
      if (e.expiresAt && now > e.expiresAt) continue;
      r[this._ns && k.startsWith(this._ns) ? k.slice(this._ns.length) : k] = e.value;
    }
    return r;
  }

  // ── Conversation history ───────────────────────────────────────────────────
  addMessage(role, content) {
    const h = this.get("__history__") || [];
    h.push({ role, content, timestamp: new Date().toISOString() });
    this.set("__history__", h);
    return this;
  }
  getHistory(limit) {
    const h = this.get("__history__") || [];
    return limit ? h.slice(-limit) : h;
  }
  clearHistory() { this.delete("__history__"); return this; }

  // ── Long-term (adapter) ────────────────────────────────────────────────────
  async persist(key, value) {
    if (!this._adapter) throw new MemoryError("No adapter configured");
    await this._adapter.set(key, value);
    this.set(key, value);
    return this;
  }

  async recall(key) {
    if (!this._adapter) return this.get(key);
    const cached = this.get(key);
    if (cached !== null) return cached;
    const v = await this._adapter.get(key);
    if (v !== null && v !== undefined) this.set(key, v);
    return v ?? null;
  }

  async forget(key) {
    this.delete(key);
    if (this._adapter) await this._adapter.delete(key);
    return this;
  }
}

// ── Adapters ──────────────────────────────────────────────────────────────────

class InMemoryAdapter {
  constructor() { this._s = new Map(); }
  async get(k)    { return this._s.has(k) ? this._s.get(k) : null; }
  async set(k, v) { this._s.set(k, v); }
  async delete(k) { this._s.delete(k); }
  async keys()    { return [...this._s.keys()]; }
}

class FileAdapter {
  constructor(opts = {}) {
    const path = require("path");
    this._path  = opts.path || path.join(process.cwd(), ".agent-memory.json");
    this._fs    = require("fs");
    this._cache = null;
  }
  _load()  { if (!this._cache) { try { this._cache = JSON.parse(this._fs.readFileSync(this._path, "utf8")); } catch { this._cache = {}; } } return this._cache; }
  _save()  {
    // Atomic write: serialize to a temp file, then rename over the target so a
    // crash mid-write can never leave a partially-written store.
    const tmp = `${this._path}.${process.pid}.${Date.now()}.tmp`;
    this._fs.mkdirSync(require("path").dirname(this._path), { recursive: true });
    this._fs.writeFileSync(tmp, JSON.stringify(this._cache, null, 2));
    this._fs.renameSync(tmp, this._path);
  }
  async get(k)    { const data = this._load(); return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; }
  async set(k, v) { this._load()[k] = v; this._save(); }
  async delete(k) { delete this._load()[k]; this._save(); }
  async keys()    { return Object.keys(this._load()); }
}

class MemoryError extends Error { constructor(m) { super(m); this.name = "MemoryError"; } }

module.exports = { MemoryLayer, InMemoryAdapter, FileAdapter, MemoryError };
