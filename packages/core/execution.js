"use strict";

class ExecutionEngine {
  constructor(opts = {}) {
    this.defaultTimeout = opts.timeout         || 10000;
    this.defaultRetries = opts.retries         || 0;
    this.debug          = opts.debug           || false;
    this.onBeforeExecute = opts.onBeforeExecute || null;
    this.onAfterExecute  = opts.onAfterExecute  || null;
  }

  async execute(tool, args, context = {}) {
    const start      = Date.now();
    const timeout    = tool.options?.timeout ?? this.defaultTimeout;
    const maxRetries = tool.options?.retries ?? this.defaultRetries;
    let lastError    = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0 && this.debug) console.log(`[Engine] Retry ${attempt}/${maxRetries}: ${tool.name}`);
      try {
        if (this.onBeforeExecute) await this.onBeforeExecute({ tool, args, context, attempt });
        const output = await this._withTimeout(tool.handler, args, context, timeout);
        const result = new ExecutionResult({ status: "success", tool: tool.name, args, output, duration: Date.now() - start, attempt });
        if (this.onAfterExecute) await this.onAfterExecute({ result, context });
        if (this.debug) console.log(`[Engine] ✓ ${tool.name} (${result.duration}ms)`);
        return result;
      } catch (err) {
        lastError = err;
        if (err instanceof ExecutionTimeoutError) break;
        if (attempt < maxRetries) await this._sleep(Math.min(500 * 2 ** attempt, 5000));
      }
    }

    const result = new ExecutionResult({ status: "error", tool: tool.name, args, output: null, error: lastError, duration: Date.now() - start, attempt: maxRetries });
    if (this.onAfterExecute) await this.onAfterExecute({ result, context }).catch(() => {});
    if (this.debug) console.error(`[Engine] ✗ ${tool.name}:`, lastError?.message);
    return result;
  }

  _withTimeout(handler, args, context, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new ExecutionTimeoutError(`Timeout after ${ms}ms`)), ms);
      Promise.resolve(handler(args, context)).then(r => { clearTimeout(t); resolve(r); }).catch(e => { clearTimeout(t); reject(e); });
    });
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

class ExecutionResult {
  constructor({ status, tool, args, output, error, duration, attempt }) {
    this.status    = status;
    this.tool      = tool;
    this.args      = args;
    this.output    = output;
    this.error     = error  || null;
    this.duration  = duration;
    this.attempt   = attempt;
    this.timestamp = new Date().toISOString();
  }
  get success() { return this.status === "success"; }
  get failed()  { return this.status === "error"; }
  toJSON() {
    return { status: this.status, tool: this.tool, output: this.output,
      error: this.error ? { message: this.error.message, type: this.error.name } : null,
      duration: this.duration, timestamp: this.timestamp };
  }
}

class ExecutionTimeoutError extends Error { constructor(m) { super(m); this.name = "ExecutionTimeoutError"; } }
class ExecutionError        extends Error { constructor(m) { super(m); this.name = "ExecutionError"; } }

module.exports = { ExecutionEngine, ExecutionResult, ExecutionTimeoutError, ExecutionError };
