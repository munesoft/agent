"use strict";

/**
 * @munesoft/agent — Base LLM Adapter
 * All providers extend this. Provides shared HTTP, schema conversion, and intent helpers.
 */

class BaseLLMAdapter {
  constructor(opts = {}) {
    this.model       = opts.model;
    this.temperature = opts.temperature ?? 0.2;
    this.maxTokens   = opts.maxTokens   || 1024;
    this.debug       = opts.debug       || false;
  }

  async complete({ system, user, format }) {
    throw new Error(`${this.constructor.name} must implement complete()`);
  }

  async functionCall({ system, user, tools }) {
    throw new Error(`${this.constructor.name} must implement functionCall()`);
  }

  // ── Schema helpers ─────────────────────────────────────────────────────────

  _toOpenAIFunctions(tools) {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(t.schema || {}).map(([k, d]) => {
            const def = typeof d === "string" ? { type: d } : d;
            return [k, { type: def.type || "string", description: def.description || k }];
          })
        ),
        required: Object.entries(t.schema || {})
          .filter(([, d]) => (typeof d === "string" ? true : d.required !== false))
          .map(([k]) => k),
      },
    }));
  }

  _toClaudeTools(tools) {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(t.schema || {}).map(([k, d]) => {
            const def = typeof d === "string" ? { type: d } : d;
            return [k, { type: def.type || "string", description: def.description || k }];
          })
        ),
        required: Object.entries(t.schema || {})
          .filter(([, d]) => (typeof d === "string" ? true : d.required !== false))
          .map(([k]) => k),
      },
    }));
  }

  _toGeminiTools(tools) {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: "OBJECT",
        properties: Object.fromEntries(
          Object.entries(t.schema || {}).map(([k, d]) => {
            const def = typeof d === "string" ? { type: d } : d;
            const gt  = (def.type || "string").toUpperCase();
            return [k, { type: ["NUMBER","BOOLEAN","ARRAY","OBJECT"].includes(gt) ? gt : "STRING", description: def.description || k }];
          })
        ),
        required: Object.entries(t.schema || {})
          .filter(([, d]) => (typeof d === "string" ? true : d.required !== false))
          .map(([k]) => k),
      },
    }));
  }

  // ── Intent helpers ─────────────────────────────────────────────────────────

  _intent(name, args, raw) {
    return { action: name, params: args || {}, confidence: 0.95, raw };
  }

  _unknown(raw) {
    return { action: "unknown", params: {}, confidence: 0, raw };
  }

  // ── HTTP helper ────────────────────────────────────────────────────────────

  async _post(hostname, path, headers, body) {
    const https   = require("https");
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname, path, method: "POST",
          headers: {
            "Content-Type":   "application/json",
            "Content-Length": Buffer.byteLength(payload),
            ...headers,
          },
        },
        res => {
          let data = "";
          res.on("data", c => data += c);
          res.on("end", () => {
            try {
              const p = JSON.parse(data);
              if (p.error) reject(new LLMError(`${this.constructor.name}: ${p.error.message || JSON.stringify(p.error)}`));
              else resolve(p);
            } catch (e) { reject(e); }
          });
        }
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }
}

class LLMError       extends Error { constructor(m) { super(m); this.name = "LLMError"; } }
class LLMConfigError extends LLMError { constructor(m) { super(m); this.name = "LLMConfigError"; } }

module.exports = { BaseLLMAdapter, LLMError, LLMConfigError };
