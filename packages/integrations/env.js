"use strict";

/**
 * @munesoft/envx integration — environment validation & typed config.
 * Validate required env vars up front so an agent never boots with a missing API key.
 * (envx is ESM-only, so this adapter is async and lazy-imports it.)
 */
const { importDep, primary } = require("./_load");

/**
 * Load + validate environment into a typed config object.
 * @param {object} schema  envx schema, e.g. { OPENAI_API_KEY: { type: "string", required: true } }
 * @param {object} [opts]  envx options ({ path, override, strict, debug })
 * @returns {Promise<object>} the validated, coerced config
 */
async function loadAgentEnv(schema = {}, opts = {}) {
  const envx = primary(await importDep("@munesoft/envx", "loadAgentEnv"));
  return envx({ schema, ...opts });
}

module.exports = { loadAgentEnv };
