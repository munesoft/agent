"use strict";

function defineTool(config) {
  if (!config?.name || typeof config.handler !== "function") throw new SchemaDefinitionError("defineTool requires name and handler");
  const jsonSchema = config.jsonSchema || (config.schema?.type === "object" ? config.schema : null);
  const zodSchema = config.zod || (typeof config.schema?.safeParse === "function" ? config.schema : null);
  const toolSchema = jsonSchema ? jsonSchemaToToolSchema(jsonSchema) : (zodSchema ? {} : config.schema || {});
  return {
    ...config,
    schema: toolSchema,
    handler: async (args, context) => {
      let parsed = args;
      if (jsonSchema) {
        const result = validateJsonSchema(jsonSchema, args);
        if (!result.valid) throw new ToolInputValidationError(result.errors.join("; "));
      }
      if (zodSchema) {
        const result = await zodSchema.safeParseAsync?.(args) || zodSchema.safeParse(args);
        if (!result.success) throw new ToolInputValidationError(result.error?.message || "Schema validation failed");
        parsed = result.data;
      }
      return config.handler(parsed, context);
    },
  };
}

function jsonSchemaToToolSchema(schema) {
  const required = new Set(schema.required || []);
  return Object.fromEntries(Object.entries(schema.properties || {}).map(([name, field]) => [name, {
    type: field.type || "any", required: required.has(name), description: field.description,
    default: field.default, enum: field.enum, min: field.minimum, max: field.maximum,
    minLength: field.minLength, maxLength: field.maxLength, pattern: field.pattern,
    items: typeof field.items?.type === "string" ? field.items.type : undefined,
  }]));
}

function validateJsonSchema(schema, value, path = "$", errors = []) {
  if (!matchesType(schema.type, value)) errors.push(path + " must be " + schema.type);
  if (schema.enum && !schema.enum.includes(value)) errors.push(path + " must be one of " + schema.enum.join(", "));
  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (value[key] === undefined) errors.push(path + "." + key + " is required");
    for (const [key, child] of Object.entries(schema.properties || {})) if (value[key] !== undefined) validateJsonSchema(child, value[key], path + "." + key, errors);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!schema.properties?.[key]) errors.push(path + "." + key + " is not allowed");
  }
  if (schema.type === "array" && Array.isArray(value) && schema.items) value.forEach((item, index) => validateJsonSchema(schema.items, item, path + "[" + index + "]", errors));
  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) errors.push(path + " is too short");
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(path + " is too long");
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(path + " does not match pattern");
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errors.push(path + " must be >= " + schema.minimum);
    if (schema.maximum != null && value > schema.maximum) errors.push(path + " must be <= " + schema.maximum);
  }
  return { valid: errors.length === 0, errors };
}
function matchesType(type, value) {
  if (!type) return true;
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "null") return value === null;
  return typeof value === type;
}
class SchemaDefinitionError extends Error { constructor(message) { super(message); this.name = "SchemaDefinitionError"; } }
class ToolInputValidationError extends SchemaDefinitionError { constructor(message) { super(message); this.name = "ToolInputValidationError"; } }
module.exports = { defineTool, validateJsonSchema, jsonSchemaToToolSchema, SchemaDefinitionError, ToolInputValidationError };
