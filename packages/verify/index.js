"use strict";

/**
 * @munesoft/agent — Verification System
 *
 * Checks whether a tool's output actually satisfied the task, and drives an optional
 * repair loop. Where Guardrails answers "is this allowed?", the Verifier answers
 * "is this correct/complete?". Checks are composable and each returns true, a reason
 * string, or { ok, reason }. LLM-based self-critique is supported but optional.
 *
 *   const v = new Verifier()
 *     .check(checks.notEmpty())
 *     .check(checks.hasKeys(["invoiceId", "total"]))
 *     .check(checks.custom(o => o.total > 0 || "total must be positive"));
 *   const report = await v.verify(result.output, { input, tool });
 */

class Verifier {
  constructor(opts = {}) {
    this._checks   = [];
    this.debug     = opts.debug || false;
    this.minScore  = opts.minScore ?? 1;   // fraction of error-checks that must pass (1 = all)
    for (const c of opts.checks || []) this.check(c);
  }

  /** Add a check: { name?, fn, severity? } or a bare fn. */
  check(spec) {
    const c = typeof spec === "function" ? { fn: spec } : spec;
    if (typeof c.fn !== "function") throw new VerifyError("Check needs an fn");
    this._checks.push({ name: c.name || c.fn.name || `check_${this._checks.length + 1}`, fn: c.fn, severity: c.severity || "error" });
    return this;
  }

  async verify(output, ctx = {}) {
    const results = [];
    for (const c of this._checks) {
      let ok = false, reason = null;
      try {
        const r = await c.fn(output, ctx);
        if (r === true || r === undefined) ok = true;
        else if (r === false) { ok = false; reason = "check returned false"; }
        else if (typeof r === "string") { ok = false; reason = r; }
        else if (r && typeof r === "object") { ok = !!r.ok; reason = r.reason || null; }
      } catch (e) { ok = false; reason = `threw: ${e.message}`; }
      results.push({ name: c.name, ok, reason, severity: c.severity });
      if (this.debug) console.log(`[Verify] ${ok ? "✓" : "✗"} ${c.name}${reason ? " — " + reason : ""}`);
    }

    const errorChecks = results.filter(r => r.severity === "error");
    const passedErr   = errorChecks.filter(r => r.ok).length;
    const score       = errorChecks.length ? passedErr / errorChecks.length : 1;
    const passed      = score >= this.minScore && !results.some(r => r.severity === "error" && !r.ok);

    return new VerificationReport({ passed, score, checks: results });
  }

  get size() { return this._checks.length; }
}

class VerificationReport {
  constructor({ passed, score, checks }) {
    this.passed  = passed;
    this.score   = Number(score.toFixed(3));
    this.checks  = checks;
    this.failures = checks.filter(c => !c.ok);
    this.feedback = this.failures.map(f => `${f.name}: ${f.reason || "failed"}`).join("; ");
    this.timestamp = new Date().toISOString();
  }
  toJSON() { return { passed: this.passed, score: this.score, checks: this.checks, feedback: this.feedback }; }
}

// ── Built-in check factories ────────────────────────────────────────────────────
const checks = {
  notEmpty: () => ({ name: "notEmpty", fn: (o) =>
    (o !== null && o !== undefined && !(typeof o === "string" && o.trim() === "") && !(Array.isArray(o) && o.length === 0)) || "output is empty" }),

  hasKeys: (keys) => ({ name: "hasKeys", fn: (o) => {
    if (!o || typeof o !== "object") return "output is not an object";
    const missing = keys.filter(k => !(k in o));
    return missing.length ? `missing keys: ${missing.join(", ")}` : true;
  }}),

  matches: (pattern, field) => ({ name: "matches", fn: (o) => {
    const val = field ? o?.[field] : o;
    const re  = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    return re.test(String(val ?? "")) || `does not match ${re}`;
  }}),

  type: (t, field) => ({ name: "type", fn: (o) => {
    const val = field ? o?.[field] : o;
    const actual = Array.isArray(val) ? "array" : typeof val;
    return actual === t || `expected ${t}, got ${actual}`;
  }}),

  range: (field, { min, max }) => ({ name: "range", fn: (o) => {
    const v = Number(field ? o?.[field] : o);
    if (Number.isNaN(v)) return `${field || "value"} is not a number`;
    if (min !== undefined && v < min) return `${field || "value"} < ${min}`;
    if (max !== undefined && v > max) return `${field || "value"} > ${max}`;
    return true;
  }}),

  jsonShape: (shape) => ({ name: "jsonShape", fn: (o) => {
    if (!o || typeof o !== "object") return "not an object";
    for (const [k, t] of Object.entries(shape)) {
      const actual = Array.isArray(o[k]) ? "array" : typeof o[k];
      if (!(k in o)) return `missing "${k}"`;
      if (t !== "any" && actual !== t) return `"${k}" expected ${t}, got ${actual}`;
    }
    return true;
  }}),

  custom: (fn, name) => ({ name: name || "custom", fn }),

  /** LLM self-critique: asks a model whether output satisfies criteria. Needs an adapter with .complete(). */
  llmCheck: (llm, criteria, opts = {}) => ({ name: opts.name || "llmCheck", severity: opts.severity || "error", fn: async (o, ctx) => {
    if (!llm?.complete) return true;
    const system = "You are a strict output verifier. Reply with a JSON object {\"pass\": boolean, \"reason\": string}. Only pass if the output fully satisfies the criteria.";
    const user   = `Task: ${ctx.input || "(unknown)"}\nCriteria: ${criteria}\nOutput: ${typeof o === "string" ? o : JSON.stringify(o)}`;
    try {
      const raw = await llm.complete({ system, user, format: "json" });
      const p   = typeof raw === "string" ? JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw) : raw;
      return p.pass ? true : (p.reason || "LLM verification failed");
    } catch { return true; } // fail-open on verifier infra errors
  }}),
};

class VerifyError extends Error { constructor(m) { super(m); this.name = "VerifyError"; } }

module.exports = { Verifier, VerificationReport, checks, VerifyError };
