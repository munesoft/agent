"use strict";

class MemoryLayer {
  constructor(opts = {}) {
    this._short            = new Map();
    this._adapter          = opts.adapter          || null;
    this._maxItems         = opts.maxShortTermItems || 100;
    this._ttlMs            = opts.ttl              || null;
    this.debug             = opts.debug            || false;
  }

  // ── Short-term ─────────────────────────────────────────────────────────────
  set(key, value) {
    if (this._short.size >= this._maxItems) this._short.delete(this._short.keys().next().value);
    this._short.set(key, { value, timestamp: Date.now(), expiresAt: this._ttlMs ? Date.now() + this._ttlMs : null });
    return this;
  }

  get(key) {
    const e = this._short.get(key);
    if (!e) return null;
    if (e.expiresAt && Date.now() > e.expiresAt) { this._short.delete(key); return null; }
    return e.value;
  }

  has(key)    { return this.get(key) !== null; }
  delete(key) { this._short.delete(key); return this; }
  clear()     { this._short.clear(); return this; }

  snapshot() {
    const r = {};
    for (const [k, e] of this._short.entries())
      if (!e.expiresAt || Date.now() <= e.expiresAt) r[k] = e.value;
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
    return v || null;
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
  async get(k)    { return this._s.get(k) || null; }
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
  _save()  { this._fs.writeFileSync(this._path, JSON.stringify(this._cache, null, 2)); }
  async get(k)    { return this._load()[k] || null; }
  async set(k, v) { this._load()[k] = v; this._save(); }
  async delete(k) { delete this._load()[k]; this._save(); }
  async keys()    { return Object.keys(this._load()); }
}

class MemoryError extends Error { constructor(m) { super(m); this.name = "MemoryError"; } }

module.exports = { MemoryLayer, InMemoryAdapter, FileAdapter, MemoryError };
