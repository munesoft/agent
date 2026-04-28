"use strict";

class Guardrails {
  constructor(opts = {}) {
    this.maxRetries       = opts.maxRetries      || 3;
    this.allowedActions   = opts.allowedActions  || null;
    this.blockedActions   = opts.blockedActions  || [];
    this.outputValidators = opts.outputValidators || [];
    this.inputSanitizers  = opts.inputSanitizers  || [];
    this.maxInputLength   = opts.maxInputLength   || 10000;
    this.debug            = opts.debug            || false;
  }

  sanitizeInput(input) {
    if (typeof input !== "string") throw new GuardrailError("Input must be a string");
    if (input.length > this.maxInputLength)
      throw new GuardrailError(`Input too long (${input.length} > ${this.maxInputLength})`);
    let s = input;
    for (const fn of this.inputSanitizers) s = fn(s);
    return s.trim();
  }

  validateIntent(intent) {
    if (!intent?.action)                           throw new GuardrailError("Intent must have an action");
    if (intent.action === "unknown")               throw new UnknownIntentError("Agent could not determine action");
    if (this.allowedActions && !this.allowedActions.includes(intent.action))
      throw new BlockedActionError(`Action "${intent.action}" not in allowedActions`);
    if (this.blockedActions.includes(intent.action))
      throw new BlockedActionError(`Action "${intent.action}" is blocked`);
    if (intent.confidence !== undefined && intent.confidence < 0.3)
      throw new LowConfidenceError(`Confidence too low (${intent.confidence.toFixed(2)})`);
    return true;
  }

  validateOutput(result, tool) {
    if (!result) throw new GuardrailError("Execution result is null");
    if (result.failed) { if (this.debug) console.warn(`[Guardrails] ${result.tool} failed`); return false; }
    for (const v of this.outputValidators) {
      const r = v(result.output, tool);
      if (r !== true) throw new OutputValidationError(`Output validation failed: ${r}`);
    }
    return true;
  }

  addInputSanitizer(fn)  { if (typeof fn !== "function") throw new GuardrailError("Must be a function"); this.inputSanitizers.push(fn);  return this; }
  addOutputValidator(fn) { if (typeof fn !== "function") throw new GuardrailError("Must be a function"); this.outputValidators.push(fn); return this; }
  blockAction(name)      { if (!this.blockedActions.includes(name)) this.blockedActions.push(name); return this; }

  summary() {
    return { maxRetries: this.maxRetries, maxInputLength: this.maxInputLength,
      allowedActions: this.allowedActions, blockedActions: this.blockedActions,
      outputValidators: this.outputValidators.length, inputSanitizers: this.inputSanitizers.length };
  }
}

class GuardrailError       extends Error { constructor(m) { super(m); this.name = "GuardrailError"; } }
class BlockedActionError   extends GuardrailError { constructor(m) { super(m); this.name = "BlockedActionError"; } }
class UnknownIntentError   extends GuardrailError { constructor(m) { super(m); this.name = "UnknownIntentError"; } }
class LowConfidenceError   extends GuardrailError { constructor(m) { super(m); this.name = "LowConfidenceError"; } }
class OutputValidationError extends GuardrailError { constructor(m) { super(m); this.name = "OutputValidationError"; } }

module.exports = { Guardrails, GuardrailError, BlockedActionError, UnknownIntentError, LowConfidenceError, OutputValidationError };
