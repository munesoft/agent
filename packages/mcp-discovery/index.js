"use strict";

class MCPDiscovery {
  constructor(opts = {}) { this.servers = new Map(); this.prefix = opts.prefix ?? true; }
  add(name, client, opts = {}) { if (!name || !client?.listTools || !client?.callTool) throw new MCPDiscoveryError("MCP server requires name, listTools, and callTool"); this.servers.set(name, { client, prefix: opts.prefix ?? this.prefix }); return this; }
  remove(name) { return this.servers.delete(name); }
  list() { return [...this.servers.keys()]; }
  async discover(registry, opts = {}) {
    const imported = [];
    for (const [serverName, server] of this.servers) {
      const response = await server.client.listTools();
      for (const definition of response.tools || []) {
        if (opts.filter && !opts.filter(definition, serverName)) continue;
        const name = server.prefix ? serverName + "__" + definition.name : definition.name;
        if (registry.has(name)) continue;
        registry.register({
          name,
          description: definition.description || definition.name,
          schema: toToolSchema(definition.inputSchema || {}),
          options: { tags: ["mcp", "mcp:" + serverName] },
          handler: async args => decode(await server.client.callTool({ name: definition.name, arguments: args })),
        });
        imported.push({ server: serverName, source: definition.name, name });
      }
    }
    return imported;
  }
}
function toToolSchema(schema) { const required = new Set(schema.required || []); return Object.fromEntries(Object.entries(schema.properties || {}).map(([name, field]) => [name, { type: field.type || "string", description: field.description || name, required: required.has(name) }])); }
function decode(result) { const text = result?.content?.find(item => item.type === "text")?.text; if (text == null) return result; try { return JSON.parse(text); } catch { return text; } }
class MCPDiscoveryError extends Error { constructor(message) { super(message); this.name = "MCPDiscoveryError"; } }
module.exports = { MCPDiscovery, MCPDiscoveryError };
