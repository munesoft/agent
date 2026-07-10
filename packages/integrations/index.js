"use strict";

/**
 * @munesoft/agent — Munesoft Stack Integrations (opt-in)
 *
 * First-class adapters that wire the agent framework to the wider munesoft stack.
 * The core stays zero-dependency: every adapter lazy-loads its package only when
 * called, so `require("@munesoft/agent/integrations")` is always safe — you only
 * need a package installed to use *its* adapter.
 *
 *   const { retryableTool, createMemoryxStore } = require("@munesoft/agent/integrations");
 */

const { IntegrationError, isAvailable } = require("./_load");

const env         = require("./env");          // @munesoft/envx
const logging     = require("./logging");      // @munesoft/logx
const retry       = require("./retry");        // @munesoft/retryx
const concurrency = require("./concurrency");  // @munesoft/asyncx
const ids         = require("./ids");          // @munesoft/idx
const objects     = require("./objects");      // @munesoft/objx
const normalize   = require("./normalize");    // @munesoft/api-normalizer
const memory      = require("./memory");       // @munesoft/memoryx
const loop        = require("./loop");         // @munesoft/loopx

/** What each adapter needs + why. Handy for docs, health checks, and diagnostics. */
const STACK = {
  "@munesoft/envx":           { adapters: ["loadAgentEnv"],                      use: "environment validation & typed config" },
  "@munesoft/logx":           { adapters: ["attachLogx"],                        use: "structured logs for the agent lifecycle" },
  "@munesoft/retryx":         { adapters: ["withRetry", "retryableTool"],        use: "safe, retryable API calls" },
  "@munesoft/asyncx":         { adapters: ["boundedParallel"],                   use: "concurrency limits for background jobs" },
  "@munesoft/idx":            { adapters: ["idFactory", "withStableIds"],        use: "stable internal IDs" },
  "@munesoft/objx":           { adapters: ["mergeSettings", "safeGet", "applyDefaults", "hasPath"], use: "safe nested access & settings merging" },
  "@munesoft/api-normalizer": { adapters: ["normalizeResponse", "normalizingTool", "inferResponseSchema"], use: "normalize external API/tool responses" },
  "@munesoft/memoryx":        { adapters: ["createMemoryxStore"],                use: "semantic episodic memory / recall source" },
  "@munesoft/loopx":          { adapters: ["runAgentLoop"],                      use: "drive multi-step AI loops" },
};

/** Report which stack packages are currently installed/resolvable. */
function stackStatus() {
  const out = {};
  for (const pkg of Object.keys(STACK)) out[pkg] = { ...STACK[pkg], installed: isAvailable(pkg) };
  return out;
}

module.exports = {
  ...env, ...logging, ...retry, ...concurrency,
  ...ids, ...objects, ...normalize, ...memory, ...loop,
  STACK, stackStatus, isAvailable, IntegrationError,
};
