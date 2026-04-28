"use strict";

class ActionRouter {
  constructor(registry, opts = {}) {
    if (!registry) throw new RouterError("ActionRouter requires a ToolRegistry");
    this.registry = registry;
    this.debug    = opts.debug || false;
  }

  route(intent) {
    if (!intent?.action) throw new RouterError("Intent must have an action field");
    if (intent.action === "unknown")
      throw new UnresolvableIntentError(`Could not determine action for: "${intent.raw || "unknown"}"`);

    const tool = this.registry.get(intent.action);
    if (!tool)
      throw new ToolNotFoundError(
        `No tool "${intent.action}". Available: ${this.registry.list().map(t => t.name).join(", ") || "none"}`);

    const args = this._validateArgs(intent.params || {}, tool.schema, tool.name);
    if (this.debug) console.log(`[Router] ${intent.action}`, args);
    return { tool, args };
  }

  _validateArgs(params, schema, toolName) {
    const result = {}, errors = [];
    for (const [key, fieldDef] of Object.entries(schema)) {
      const def   = typeof fieldDef === "string" ? { type: fieldDef, required: true } : { required: true, ...fieldDef };
      const value = params[key];
      if (def.required && (value === undefined || value === null || value === "")) {
        errors.push(`Missing required param "${key}" (${def.type})`); continue;
      }
      if (value === undefined || value === null) {
        if (def.default !== undefined) result[key] = def.default;
        continue;
      }
      const coerced = this._coerce(value, def.type);
      if (coerced === null) errors.push(`Param "${key}" must be ${def.type}, got ${typeof value}`);
      else result[key] = coerced;
    }
    for (const [k, v] of Object.entries(params)) if (!(k in result)) result[k] = v;
    if (errors.length) throw new SchemaValidationError(`Schema error for "${toolName}":\n  - ${errors.join("\n  - ")}`);
    return result;
  }

  _coerce(v, type) {
    if (!type) return v;
    switch (type) {
      case "string":  return String(v);
      case "number":  { const n = Number(v); return isNaN(n) ? null : n; }
      case "boolean": return typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null;
      case "array":   return Array.isArray(v) ? v : null;
      case "object":  return typeof v === "object" && !Array.isArray(v) ? v : null;
      default:        return v;
    }
  }
}

class RouterError           extends Error { constructor(m) { super(m); this.name = "RouterError"; } }
class ToolNotFoundError     extends RouterError { constructor(m) { super(m); this.name = "ToolNotFoundError"; } }
class UnresolvableIntentError extends RouterError { constructor(m) { super(m); this.name = "UnresolvableIntentError"; } }
class SchemaValidationError extends RouterError { constructor(m) { super(m); this.name = "SchemaValidationError"; } }

module.exports = { ActionRouter, RouterError, ToolNotFoundError, UnresolvableIntentError, SchemaValidationError };
