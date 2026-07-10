"use strict";

class ToolRegistry {
  constructor() { this._tools = new Map(); }

  register(tool) {
    this._validate(tool);
    if (this._tools.has(tool.name)) throw new ToolRegistryError(`Tool "${tool.name}" already registered`);
    this._tools.set(tool.name, {
      name: tool.name, description: tool.description,
      schema: tool.schema || {}, handler: tool.handler,
<<<<<<< HEAD
      aliases: tool.aliases || tool.options?.aliases || [],
      options: { timeout: tool.options?.timeout || 10000, retries: tool.options?.retries || 0, tags: tool.options?.tags || [], aliases: tool.aliases || tool.options?.aliases || [] },
=======
      options: { timeout: tool.options?.timeout || 10000, retries: tool.options?.retries || 0, tags: tool.options?.tags || [] },
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
      registeredAt: new Date().toISOString(),
    });
    return this;
  }

  override(tool) {
    this._validate(tool);
    this._tools.set(tool.name, { ...(this._tools.get(tool.name) || {}), ...tool,
<<<<<<< HEAD
      aliases: tool.aliases || tool.options?.aliases || [],
      options: { timeout: tool.options?.timeout || 10000, retries: tool.options?.retries || 0, tags: tool.options?.tags || [], aliases: tool.aliases || tool.options?.aliases || [] } });
=======
      options: { timeout: tool.options?.timeout || 10000, retries: tool.options?.retries || 0, tags: tool.options?.tags || [] } });
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
    return this;
  }

  unregister(name) {
    if (!this._tools.has(name)) throw new ToolRegistryError(`Tool "${name}" not found`);
    this._tools.delete(name);
    return this;
  }

  get(name)  { return this._tools.get(name) || null; }
  has(name)  { return this._tools.has(name); }
<<<<<<< HEAD
  list()     { return Array.from(this._tools.values()).map(({ name, description, schema, options, aliases }) => ({ name, description, schema, tags: options.tags, aliases: aliases || [] })); }
=======
  list()     { return Array.from(this._tools.values()).map(({ name, description, schema, options }) => ({ name, description, schema, tags: options.tags })); }
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
  getByTag(tag) { return this.list().filter(t => t.tags.includes(tag)); }

  _validate(tool) {
    if (!tool?.name)                   throw new ToolRegistryError("Tool needs a name");
    if (!tool.description)             throw new ToolRegistryError(`Tool "${tool.name}" needs a description`);
    if (typeof tool.handler !== "function") throw new ToolRegistryError(`Tool "${tool.name}" needs a handler`);
  }
}

class ToolRegistryError extends Error { constructor(m) { super(m); this.name = "ToolRegistryError"; } }

module.exports = { ToolRegistry, ToolRegistryError };
