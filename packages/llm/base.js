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
    this.requestTimeout = opts.requestTimeout ?? 30000;
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

  async _post(hostname, requestPath, headers, body) {
    const https = require("https");
    const http = require("http");
    const payload = JSON.stringify(body);
    let transport = https;
    let targetPath = requestPath;
    let options = { hostname, path: targetPath };

    if (/^https?:\/\//i.test(hostname)) {
      const base = new URL(hostname);
      transport = base.protocol === "http:" ? http : https;
      const basePath = base.pathname.replace(/\/$/, "");
      if (basePath && !requestPath.startsWith(basePath + "/") && requestPath !== basePath) targetPath = basePath + requestPath;
      options = { protocol: base.protocol, hostname: base.hostname, port: base.port || undefined, path: targetPath };
    }

    return new Promise((resolve, reject) => {
      const req = transport.request(
        {
          ...options, method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            ...headers,
          },
        },
        res => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", chunk => { data += chunk; });
          res.on("end", () => {
            let parsed;
            try { parsed = data ? JSON.parse(data) : {}; }
            catch (error) { return reject(new LLMError(this.constructor.name + ": invalid JSON response (HTTP " + res.statusCode + ")")); }
            if (res.statusCode < 200 || res.statusCode >= 300 || parsed.error) {
              const detail = parsed.error?.message || parsed.message || data.slice(0, 500) || "request failed";
              return reject(new LLMError(this.constructor.name + ": HTTP " + res.statusCode + " - " + detail));
            }
            resolve(parsed);
          });
        }
      );
      req.on("error", reject);
      if (this.requestTimeout > 0) req.setTimeout(this.requestTimeout, () => req.destroy(new LLMError(this.constructor.name + ": request timed out after " + this.requestTimeout + "ms")));
      req.write(payload);
      req.end();
    });
  }
}

class LLMError       extends Error { constructor(m) { super(m); this.name = "LLMError"; } }
class LLMConfigError extends LLMError { constructor(m) { super(m); this.name = "LLMConfigError"; } }

module.exports = { BaseLLMAdapter, LLMError, LLMConfigError };
