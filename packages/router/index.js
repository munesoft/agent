"use strict";

/**
 * @munesoft/agent — Router Brain
 *
 * Resolves an Intent → a concrete tool call by *scoring* across multiple strategies
 * instead of a single exact-name lookup:
 *
 *   1. exact name        (score 1.00)
 *   2. alias             router-level { alias: tool } map, then tool-level aliases
 *   3. exact tag         a tool tagged with the action
 *   4. fuzzy name        Dice bigram similarity on the action vs tool name
 *   5. keyword overlap   action tokens vs tool name + description
 *
 * A confidence floor (`threshold`) rejects weak matches; a small `ambiguityGap`
 * flags ties, which can be broken by an async `disambiguate()` (e.g. an LLM) or a
 * configured `fallbackTool`. route() is async and returns a full RouteDecision so
 * callers can see *why* a tool was chosen.
 *
 * Args are then coerced + validated against the tool's schema (types, enum, min/max,
 * minLength/maxLength, pattern, array items, defaults).
 */

const DEFAULTS = { threshold: 0.45, ambiguityGap: 0.08 };

class ActionRouter {
  constructor(registry, opts = {}) {
    if (!registry) throw new RouterError("ActionRouter requires a ToolRegistry");
    this.registry     = registry;
    this.debug        = opts.debug || false;
    this.threshold    = opts.threshold    ?? DEFAULTS.threshold;
    this.ambiguityGap = opts.ambiguityGap ?? DEFAULTS.ambiguityGap;
    this.fallbackTool = opts.fallbackTool || null;
    this.aliases      = opts.aliases || {};           // { aliasName: toolName }
    this.strict       = opts.strict || false;         // strict => exact/alias only
    this._disambiguate = typeof opts.disambiguate === "function" ? opts.disambiguate : null;
  }

  /**
   * Resolve an intent to { tool, args, decision }.
   * @param {{action:string, params?:object, confidence?:number, raw?:string}} intent
   * @returns {Promise<{tool:object, args:object, decision:object}>}
   */
  async route(intent) {
    if (!intent?.action) throw new RouterError("Intent must have an action field");
    if (intent.action === "unknown")
      throw new UnresolvableIntentError(`Could not determine action for: "${intent.raw || "unknown"}"`);

    const decision = this._score(intent.action);

    // Ambiguity → try an async tie-breaker before giving up.
    if (decision.strategy === "ambiguous" && this._disambiguate) {
      const chosen = await this._disambiguate(intent, decision.candidates);
      if (chosen && this.registry.get(chosen)) {
        decision.resolved = chosen;
        decision.tool     = chosen;
        decision.strategy = "llm-disambiguated";
        decision.score    = decision.candidates.find(c => c.name === chosen)?.score ?? decision.score;
      }
    }

    // Fallback tool as a last resort.
    if (!decision.resolved && this.fallbackTool && this.registry.get(this.fallbackTool)) {
      decision.resolved = this.fallbackTool;
      decision.tool     = this.fallbackTool;
      decision.strategy = "fallback";
    }

    if (!decision.resolved) {
      if (decision.strategy === "ambiguous")
        throw new AmbiguousIntentError(`Ambiguous intent "${intent.action}" — candidates: ${decision.candidates.map(c => c.name).join(", ")}`, decision.candidates);
      throw new ToolNotFoundError(
        `No tool resolved for "${intent.action}". Available: ${this.registry.list().map(t => t.name).join(", ") || "none"}`,
        decision.candidates);
    }

    const tool = this.registry.get(decision.resolved);
    const args = this._validateArgs(intent.params || {}, tool.schema, tool.name);
    if (this.debug) console.log(`[Router] ${intent.action} → ${tool.name} (${decision.strategy} ${decision.score})`);
    return { tool, args, decision };
  }

  _score(action) {
    const tools = this.registry.list(); // [{ name, description, schema, tags, aliases }]
    const mk = (strategy, name, score, candidates) =>
      ({ strategy, tool: name, resolved: name, score: Number(score.toFixed(4)), candidates: candidates || [{ name, score: Number(score.toFixed(4)) }] });

    // 1. exact name
    if (this.registry.get(action)) return mk("exact", action, 1);

    // 2. alias — router-level, then tool-level
    if (this.aliases[action] && this.registry.get(this.aliases[action]))
      return mk("alias", this.aliases[action], 0.95);
    for (const t of tools)
      if ((t.aliases || []).includes(action)) return mk("alias", t.name, 0.95);

    // 3. exact tag (only when unambiguous)
    const tagged = tools.filter(t => (t.tags || []).includes(action));
    if (tagged.length === 1) return mk("tag", tagged[0].name, 0.8);

    if (this.strict)
      return { strategy: "none", tool: null, resolved: null, score: 0, candidates: [] };

    // 4 + 5. fuzzy name + keyword overlap
    const scored = tools
      .map(t => {
        const nameScore = dice(action, t.name);
        const kwScore   = keywordOverlap(action, `${t.name} ${t.description || ""}`);
        return { name: t.name, score: Number(Math.max(nameScore, 0.6 * kwScore).toFixed(4)) };
      })
      .sort((a, b) => b.score - a.score);

    const candidates = scored.filter(c => c.score > 0).slice(0, 5);
    const top = scored[0];
    if (!top || top.score < this.threshold)
      return { strategy: "none", tool: null, resolved: null, score: top?.score || 0, candidates };

    const second = scored[1];
    if (second && second.score >= this.threshold && (top.score - second.score) < this.ambiguityGap)
      return { strategy: "ambiguous", tool: null, resolved: null, score: top.score, candidates };

    return { strategy: "fuzzy", tool: top.name, resolved: top.name, score: top.score, candidates };
  }

  _validateArgs(params, schema, toolName) {
    const result = {}, errors = [];
    for (const [key, fieldDef] of Object.entries(schema || {})) {
      const def = normalizeField(fieldDef);
      const value = params[key];

      if (def.required && (value === undefined || value === null || value === "")) {
        errors.push(`Missing required param "${key}" (${def.type})`); continue;
      }
      if (value === undefined || value === null) {
        if (def.default !== undefined) result[key] = def.default;
        continue;
      }

      const coerced = this._coerce(value, def.type);
      if (coerced === null) { errors.push(`Param "${key}" must be ${def.type}, got ${typeof value}`); continue; }

      const problem = validateConstraints(key, coerced, def);
      if (problem) { errors.push(problem); continue; }
      result[key] = coerced;
    }
    for (const [k, v] of Object.entries(params)) if (!(k in result)) result[k] = v;
    if (errors.length) throw new SchemaValidationError(`Schema error for "${toolName}":\n  - ${errors.join("\n  - ")}`);
    return result;
  }

  _coerce(v, type) {
    if (!type || type === "any") return v;
    switch (type) {
      case "string":  return String(v);
      case "number":  { const n = Number(v); return isNaN(n) ? null : n; }
      case "integer": { const n = Number(v); return isNaN(n) ? null : Math.trunc(n); }
      case "boolean": return typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null;
      case "array":   return Array.isArray(v) ? v : null;
      case "object":  return typeof v === "object" && !Array.isArray(v) ? v : null;
      default:        return v;
    }
  }
}

// ── Field helpers ─────────────────────────────────────────────────────────────
function normalizeField(fieldDef) {
  if (typeof fieldDef === "string") {
    const optional = fieldDef.endsWith("?");
    return { type: optional ? fieldDef.slice(0, -1) : fieldDef, required: !optional };
  }
  return { required: true, ...fieldDef };
}

function validateConstraints(key, value, def) {
  if (def.enum && !def.enum.includes(value)) return `Param "${key}" must be one of ${def.enum.join(", ")}`;
  if (def.type === "number" || def.type === "integer") {
    if (def.min !== undefined && value < def.min) return `Param "${key}" must be >= ${def.min}`;
    if (def.max !== undefined && value > def.max) return `Param "${key}" must be <= ${def.max}`;
  }
  if (def.type === "string") {
    if (def.minLength !== undefined && value.length < def.minLength) return `Param "${key}" must be >= ${def.minLength} chars`;
    if (def.maxLength !== undefined && value.length > def.maxLength) return `Param "${key}" must be <= ${def.maxLength} chars`;
    if (def.pattern && !new RegExp(def.pattern).test(value)) return `Param "${key}" does not match ${def.pattern}`;
  }
  if (def.type === "array" && def.items) {
    const bad = value.find(v => typeof v !== def.items && !(def.items === "array" && Array.isArray(v)));
    if (bad !== undefined) return `Param "${key}" items must be ${def.items}`;
  }
  return null;
}

// ── Similarity ────────────────────────────────────────────────────────────────
function bigrams(s) {
  const str = String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const out = new Map();
  for (let i = 0; i < str.length - 1; i++) {
    const bg = str.slice(i, i + 2);
    out.set(bg, (out.get(bg) || 0) + 1);
  }
  return out;
}

function dice(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let overlap = 0;
  for (const [bg, count] of A) if (B.has(bg)) overlap += Math.min(count, B.get(bg));
  return (2 * overlap) / (sum(A) + sum(B));
}
function sum(map) { let n = 0; for (const v of map.values()) n += v; return n; }

function tokens(s) { return String(s).toLowerCase().split(/[^a-z0-9]+/g).filter(w => w.length > 1); }
function keywordOverlap(action, text) {
  const a = new Set(tokens(action));
  if (!a.size) return 0;
  const t = new Set(tokens(text));
  let hits = 0;
  for (const w of a) if (t.has(w)) hits++;
  return hits / a.size;
}

class RouterError             extends Error { constructor(m) { super(m); this.name = "RouterError"; } }
class ToolNotFoundError       extends RouterError { constructor(m, candidates = []) { super(m); this.name = "ToolNotFoundError"; this.candidates = candidates; } }
class UnresolvableIntentError extends RouterError { constructor(m) { super(m); this.name = "UnresolvableIntentError"; } }
class SchemaValidationError   extends RouterError { constructor(m) { super(m); this.name = "SchemaValidationError"; } }
class AmbiguousIntentError    extends RouterError { constructor(m, candidates = []) { super(m); this.name = "AmbiguousIntentError"; this.candidates = candidates; } }

module.exports = { ActionRouter, RouterError, ToolNotFoundError, UnresolvableIntentError, SchemaValidationError, AmbiguousIntentError };
