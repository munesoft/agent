"use strict";

<<<<<<< HEAD
/**
 * @munesoft/agent — Guardrails
 * Answers "is this allowed / safe?" (the Verifier answers "is it correct?").
 * Input sanitization + secret/PII redaction, length + rate limits, intent
 * allow/block lists + confidence floor, and output validators + secret-leak blocking.
 */

// ── Secret / PII patterns ─────────────────────────────────────────────────────
const SECRET_PATTERNS = [
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]"],        // JWTs
  [/\bBearer\s+[A-Za-z0-9._-]{16,}\b/g,                       "Bearer [REDACTED]"],     // bearer tokens
  [/\b(?:sk|pk|rk|api|key|token|secret)[-_][A-Za-z0-9]{16,}\b/gi, "[REDACTED_KEY]"],    // prefixed API keys
  [/\b(?:\d[ -]?){13,16}\b/g,                                 "[REDACTED_CARD]"],       // card numbers
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,     "[REDACTED_EMAIL]"],      // emails
];

/** Mask common secrets/PII (API keys, JWTs, bearer tokens, cards, emails) in a string. */
function redact(s) {
  if (typeof s !== "string") return s;
  let out = s;
  for (const [re, mask] of SECRET_PATTERNS) out = out.replace(re, mask);
  return out;
}

function containsSecret(s) { return typeof s === "string" && redact(s) !== s; }

class Guardrails {
  constructor(opts = {}) {
    this.maxRetries        = opts.maxRetries       || 3;
    this.allowedActions    = opts.allowedActions   || null;
    this.blockedActions    = opts.blockedActions   || [];
    this.outputValidators  = opts.outputValidators || [];
    this.inputSanitizers   = opts.inputSanitizers  || [];
    this.maxInputLength    = opts.maxInputLength    || 10000;
    this.minConfidence     = opts.minConfidence     ?? 0.3;
    this.redactSecrets     = opts.redactSecrets     || false;
    this.blockOutputSecrets = opts.blockOutputSecrets || false;
    this.rateLimit         = opts.rateLimit         || null;   // max calls per window
    this.rateWindowMs      = opts.rateWindowMs      || 60000;
    this.debug             = opts.debug             || false;
    this._rateHits         = [];
=======
class Guardrails {
  constructor(opts = {}) {
    this.maxRetries       = opts.maxRetries      || 3;
    this.allowedActions   = opts.allowedActions  || null;
    this.blockedActions   = opts.blockedActions  || [];
    this.outputValidators = opts.outputValidators || [];
    this.inputSanitizers  = opts.inputSanitizers  || [];
    this.maxInputLength   = opts.maxInputLength   || 10000;
    this.debug            = opts.debug            || false;
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
  }

  sanitizeInput(input) {
    if (typeof input !== "string") throw new GuardrailError("Input must be a string");
    if (input.length > this.maxInputLength)
      throw new GuardrailError(`Input too long (${input.length} > ${this.maxInputLength})`);
    let s = input;
    for (const fn of this.inputSanitizers) s = fn(s);
<<<<<<< HEAD
    if (this.redactSecrets) s = redact(s);
    return s.trim();
  }

  /** Sliding-window rate limiter — only active when rateLimit is configured. */
  checkRate() {
    if (!this.rateLimit) return true;
    const now = Date.now();
    this._rateHits = this._rateHits.filter(t => now - t < this.rateWindowMs);
    if (this._rateHits.length >= this.rateLimit)
      throw new RateLimitError(`Rate limit exceeded (${this.rateLimit} per ${this.rateWindowMs}ms)`);
    this._rateHits.push(now);
    return true;
  }

  validateIntent(intent) {
    this.checkRate();
=======
    return s.trim();
  }

  validateIntent(intent) {
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
    if (!intent?.action)                           throw new GuardrailError("Intent must have an action");
    if (intent.action === "unknown")               throw new UnknownIntentError("Agent could not determine action");
    if (this.allowedActions && !this.allowedActions.includes(intent.action))
      throw new BlockedActionError(`Action "${intent.action}" not in allowedActions`);
    if (this.blockedActions.includes(intent.action))
      throw new BlockedActionError(`Action "${intent.action}" is blocked`);
<<<<<<< HEAD
    if (intent.confidence !== undefined && intent.confidence < this.minConfidence)
      throw new LowConfidenceError(`Confidence too low (${intent.confidence.toFixed(2)} < ${this.minConfidence})`);
=======
    if (intent.confidence !== undefined && intent.confidence < 0.3)
      throw new LowConfidenceError(`Confidence too low (${intent.confidence.toFixed(2)})`);
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
    return true;
  }

  validateOutput(result, tool) {
    if (!result) throw new GuardrailError("Execution result is null");
    if (result.failed) { if (this.debug) console.warn(`[Guardrails] ${result.tool} failed`); return false; }
    for (const v of this.outputValidators) {
      const r = v(result.output, tool);
      if (r !== true) throw new OutputValidationError(`Output validation failed: ${r}`);
    }
<<<<<<< HEAD
    if (this.blockOutputSecrets) {
      const str = typeof result.output === "string" ? result.output : JSON.stringify(result.output ?? "");
      if (containsSecret(str)) throw new OutputValidationError("Output appears to contain a secret/credential");
    }
=======
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
    return true;
  }

  addInputSanitizer(fn)  { if (typeof fn !== "function") throw new GuardrailError("Must be a function"); this.inputSanitizers.push(fn);  return this; }
  addOutputValidator(fn) { if (typeof fn !== "function") throw new GuardrailError("Must be a function"); this.outputValidators.push(fn); return this; }
  blockAction(name)      { if (!this.blockedActions.includes(name)) this.blockedActions.push(name); return this; }
<<<<<<< HEAD
  allowOnly(names)       { this.allowedActions = Array.isArray(names) ? names : [names]; return this; }
=======
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf

  summary() {
    return { maxRetries: this.maxRetries, maxInputLength: this.maxInputLength,
      allowedActions: this.allowedActions, blockedActions: this.blockedActions,
<<<<<<< HEAD
      outputValidators: this.outputValidators.length, inputSanitizers: this.inputSanitizers.length,
      redactSecrets: this.redactSecrets, rateLimit: this.rateLimit };
=======
      outputValidators: this.outputValidators.length, inputSanitizers: this.inputSanitizers.length };
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
  }
}

class GuardrailError       extends Error { constructor(m) { super(m); this.name = "GuardrailError"; } }
class BlockedActionError   extends GuardrailError { constructor(m) { super(m); this.name = "BlockedActionError"; } }
class UnknownIntentError   extends GuardrailError { constructor(m) { super(m); this.name = "UnknownIntentError"; } }
class LowConfidenceError   extends GuardrailError { constructor(m) { super(m); this.name = "LowConfidenceError"; } }
class OutputValidationError extends GuardrailError { constructor(m) { super(m); this.name = "OutputValidationError"; } }
<<<<<<< HEAD
class RateLimitError       extends GuardrailError { constructor(m) { super(m); this.name = "RateLimitError"; } }

module.exports = { Guardrails, GuardrailError, BlockedActionError, UnknownIntentError, LowConfidenceError, OutputValidationError, RateLimitError, redact };
=======

module.exports = { Guardrails, GuardrailError, BlockedActionError, UnknownIntentError, LowConfidenceError, OutputValidationError };
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
