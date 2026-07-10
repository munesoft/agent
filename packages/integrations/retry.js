"use strict";

/**
 * @munesoft/retryx integration — safe, retryable API calls.
 * Wrap a flaky tool handler (or any async fn) so transient failures (429/5xx/network)
 * are retried with AI-aware exponential backoff + jitter and Retry-After support.
 */
const { requireDep, primary } = require("./_load");

function _retryx() { return primary(requireDep("@munesoft/retryx", "withRetry"), "retryx"); }

/**
 * Run an async fn with retryx. `fn` receives the retry attempt context ({ attempt, signal }).
 * By default retryx retries any failure (exponential backoff + jitter). Pass `{ ai: true }`
 * for HTTP-aware mode (retry only 429/408/5xx/transient network + honor Retry-After).
 * @param {(ctx:{attempt:number,signal:AbortSignal})=>Promise<any>} fn
 * @param {object} [opts] retryx options
 */
function withRetry(fn, opts = {}) {
  return _retryx()(fn, opts);
}

/**
 * Wrap a tool so its handler is executed through retryx. The handler receives the
 * retry AbortSignal on `ctx.signal` so it can cancel in-flight work.
 * @param {object} tool  a Munesoft tool ({ name, handler, ... })
 * @param {object} [opts] retryx options
 * @returns {object} a new tool with a resilient handler
 */
function retryableTool(tool, opts = {}) {
  const handler = tool.handler;
  if (typeof handler !== "function") throw new Error("retryableTool: tool has no handler");
  return {
    ...tool,
    handler: (args, ctx = {}) =>
      _retryx()((rctx) => handler(args, { ...ctx, signal: rctx.signal, attempt: rctx.attempt }), opts),
  };
}

module.exports = { withRetry, retryableTool };
