"use strict";

class ExecutionEngine {
  constructor(opts = {}) {
    this.defaultTimeout     = opts.timeout ?? 10000;
    this.defaultRetries     = opts.retries ?? 0;
    this.defaultRetryDelay  = opts.retryDelay ?? 500;
    this.defaultMaxBackoff  = opts.maxBackoff ?? 5000;
    this.defaultJitter      = opts.jitter !== false;
    this.breakerThreshold   = opts.breakerThreshold ?? 0;
    this.breakerCooldown    = opts.breakerCooldown ?? 30000;
    this.debug              = opts.debug || false;
    this.onBeforeExecute    = opts.onBeforeExecute || null;
    this.onAfterExecute     = opts.onAfterExecute || null;
    this.onAttempt          = opts.onAttempt || null;
    this._breakers          = new Map();
  }

  async execute(tool, args, context = {}) {
    const start       = Date.now();
    const timeout     = tool.options?.timeout ?? this.defaultTimeout;
    const maxRetries  = tool.options?.retries ?? this.defaultRetries;
    const retryDelay  = tool.options?.retryDelay ?? this.defaultRetryDelay;
    const maxBackoff  = tool.options?.maxBackoff ?? this.defaultMaxBackoff;
    const jitter      = tool.options?.jitter ?? this.defaultJitter;
    const threshold   = tool.options?.breakerThreshold ?? this.breakerThreshold;
    const cooldown    = tool.options?.breakerCooldown ?? this.breakerCooldown;
    const circuitOpen = this._circuitError(tool.name, threshold, cooldown);

    if (circuitOpen) return this._failure(tool, args, circuitOpen, start, 0, context);

    let lastError = null;
    let finalAttempt = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      finalAttempt = attempt;
      try {
        if (context.signal?.aborted) throw new AbortedError("Execution aborted");
        if (attempt > 0 && this.debug) console.log("[Engine] Retry " + attempt + "/" + maxRetries + ": " + tool.name);

        const info = { tool, args, context, attempt, maxRetries };
        if (this.onAttempt) await this.onAttempt(info);
        if (this.onBeforeExecute) await this.onBeforeExecute(info);

        const output = await this._withTimeout(tool.handler, args, context, timeout);
        const result = new ExecutionResult({ status: "success", tool: tool.name, args, output, duration: Date.now() - start, attempt });
        this._recordSuccess(tool.name);
        if (this.onAfterExecute) await this.onAfterExecute({ result, context });
        if (this.debug) console.log("[Engine] success " + tool.name + " (" + result.duration + "ms)");
        return result;
      } catch (err) {
        lastError = normalizeError(err);
        if (attempt >= maxRetries || !this._isRetryable(lastError)) break;
        const base = Math.min(retryDelay * 2 ** attempt, maxBackoff);
        const wait = jitter ? Math.round(base * (0.5 + Math.random())) : base;
        if (wait > 0) await this._sleep(wait, context.signal);
      }
    }

    this._recordFailure(tool.name, threshold);
    return this._failure(tool, args, lastError, start, finalAttempt, context);
  }

  _withTimeout(handler, args, context, ms) {
    return new Promise((resolve, reject) => {
      const external = context.signal;
      const controller = new AbortController();
      let settled = false;
      let timer = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        external?.removeEventListener?.("abort", onAbort);
      };
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };
      const onAbort = () => {
        controller.abort(external?.reason);
        finish(reject, new AbortedError("Execution aborted"));
      };

      if (external?.aborted) return onAbort();
      external?.addEventListener?.("abort", onAbort, { once: true });

      if (Number.isFinite(ms) && ms > 0) {
        timer = setTimeout(() => {
          const error = new ExecutionTimeoutError("Timeout after " + ms + "ms");
          controller.abort(error);
          finish(reject, error);
        }, ms);
      }

      const attemptContext = { ...context, signal: controller.signal };
      Promise.resolve()
        .then(() => handler(args, attemptContext))
        .then(value => finish(resolve, value), error => finish(reject, normalizeError(error)));
    });
  }

  _isRetryable(error) {
    if (error?.retryable === false) return false;
    if (error instanceof ExecutionTimeoutError || error instanceof AbortedError || error instanceof CircuitOpenError) return false;
    return !["SchemaValidationError", "GuardrailError", "VerifyError"].includes(error?.name);
  }

  _circuitError(name, threshold, cooldown) {
    if (!(threshold > 0)) return null;
    const state = this._breakers.get(name);
    if (!state || !state.openedAt) return null;
    if (Date.now() - state.openedAt >= cooldown) {
      state.openedAt = 0;
      state.failures = Math.max(0, threshold - 1);
      return null;
    }
    return new CircuitOpenError("Circuit open for \"" + name + "\"");
  }

  _recordSuccess(name) { this._breakers.delete(name); }

  _recordFailure(name, threshold) {
    if (!(threshold > 0)) return;
    const state = this._breakers.get(name) || { failures: 0, openedAt: 0 };
    state.failures++;
    if (state.failures >= threshold) state.openedAt = Date.now();
    this._breakers.set(name, state);
  }

  async _failure(tool, args, error, start, attempt, context) {
    const result = new ExecutionResult({ status: "error", tool: tool.name, args, output: null, error, duration: Date.now() - start, attempt });
    if (this.onAfterExecute) await this.onAfterExecute({ result, context }).catch(() => {});
    if (this.debug) console.error("[Engine] failure " + tool.name + ":", error?.message);
    return result;
  }

  _sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new AbortedError("Execution aborted"));
      const timer = setTimeout(() => { signal?.removeEventListener?.("abort", onAbort); resolve(); }, ms);
      const onAbort = () => { clearTimeout(timer); reject(new AbortedError("Execution aborted")); };
      signal?.addEventListener?.("abort", onAbort, { once: true });
    });
  }
}

class ExecutionResult {
  constructor({ status, tool, args, output, error, duration, attempt }) {
    this.status    = status;
    this.tool      = tool;
    this.args      = args;
    this.output    = output;
    this.error     = error || null;
    this.duration  = duration;
    this.attempt   = attempt;
    this.timestamp = new Date().toISOString();
  }
  get success() { return this.status === "success"; }
  get failed()  { return this.status === "error"; }
  toJSON() {
    return { status: this.status, tool: this.tool, output: this.output,
      error: this.error ? { message: this.error.message, type: this.error.name } : null,
      duration: this.duration, attempt: this.attempt, timestamp: this.timestamp };
  }
}

function normalizeError(error) {
  return error instanceof Error ? error : new ExecutionError(typeof error === "string" ? error : "Tool execution failed");
}

class ExecutionTimeoutError extends Error { constructor(message) { super(message); this.name = "ExecutionTimeoutError"; this.retryable = false; } }
class ExecutionError        extends Error { constructor(message) { super(message); this.name = "ExecutionError"; } }
class AbortedError          extends Error { constructor(message) { super(message); this.name = "AbortedError"; this.retryable = false; } }
class CircuitOpenError      extends Error { constructor(message) { super(message); this.name = "CircuitOpenError"; this.retryable = false; } }

module.exports = { ExecutionEngine, ExecutionResult, ExecutionTimeoutError, ExecutionError, AbortedError, CircuitOpenError };
