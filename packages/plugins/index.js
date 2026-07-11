"use strict";

class PluginRegistry {
  constructor(context = {}) { this.context = context; this.plugins = new Map(); }
  async install(plugin, options = {}) {
    if (!plugin?.name || typeof plugin.setup !== "function") throw new PluginError("Plugin requires name and setup()");
    if (this.plugins.has(plugin.name)) throw new PluginError("Plugin already installed: " + plugin.name);
    const tools = [], agents = [];
    const api = { ...this.context, options,
      registerTool: tool => { this.context.registry?.register(tool); tools.push(tool.name); return tool; },
      registerAgent: (name, agent) => { this.context.orchestrator?.register(name, agent); agents.push(name); return agent; },
    };
    const cleanup = await plugin.setup(api);
    this.plugins.set(plugin.name, { plugin, tools, agents, cleanup: typeof cleanup === "function" ? cleanup : plugin.teardown || null, installedAt: new Date().toISOString() });
    return this;
  }
  async uninstall(name) { const entry = this.plugins.get(name); if (!entry) return false; if (entry.cleanup) await entry.cleanup(this.context); for (const tool of entry.tools) this.context.registry?.unregister(tool); for (const agent of entry.agents) this.context.orchestrator?.unregister(agent); this.plugins.delete(name); return true; }
  has(name) { return this.plugins.has(name); }
  list() { return [...this.plugins.values()].map(entry => ({ name: entry.plugin.name, version: entry.plugin.version || "0.0.0", description: entry.plugin.description || "", installedAt: entry.installedAt })); }
}
class PluginError extends Error { constructor(message) { super(message); this.name = "PluginError"; } }
module.exports = { PluginRegistry, PluginError };
