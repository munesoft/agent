"use strict";

/**
 * @munesoft/api-normalizer integration — normalize messy external API / tool responses
 * into a stable shape before they enter the agent pipeline.
 */
const { requireDep } = require("./_load");

function _norm(adapter) {
  const m = requireDep("@munesoft/api-normalizer", adapter);
  return (m && m.normalize) ? m : (m.default || m);
}

/**
 * Normalize raw data against a schema.
 * @param {unknown} data
 * @param {object} schema  api-normalizer schema (field mappings + coercions)
 * @param {object} [options]
 */
function normalizeResponse(data, schema, options = {}) {
  return _norm("normalizeResponse").normalize(data, schema, options);
}

/** Infer a starter schema from a sample response (refine before production use). */
function inferResponseSchema(sample) {
  return _norm("inferResponseSchema").inferSchema(sample);
}

/**
 * Wrap a tool so its output is normalized against `schema` before being returned.
 * @param {object} tool
 * @param {object} schema
 * @param {object} [options]
 */
function normalizingTool(tool, schema, options = {}) {
  const handler = tool.handler;
  if (typeof handler !== "function") throw new Error("normalizingTool: tool has no handler");
  return {
    ...tool,
    handler: async (args, ctx) => {
      const out = await handler(args, ctx);
      const res = normalizeResponse(out, schema, options);
      return res && "data" in res ? res.data : res;
    },
  };
}

module.exports = { normalizeResponse, inferResponseSchema, normalizingTool };
