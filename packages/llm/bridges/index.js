"use strict";

/**
 * @munesoft/agent — Framework Bridges
 *
 * Bidirectional adapters so Munesoft agents can:
 * (A) USE external frameworks as a tool/backend
 * (B) BE USED by external frameworks as a tool/node
 *
 * Covered:
 *   LangChain · LangGraph · AutoGPT · CrewAI · Microsoft AutoGen
 *   OpenAI Agents SDK · OpenAI Swarm · LlamaIndex · Semantic Kernel
 *   Haystack · Flowise · Dust · AgentGPT · OpenDevin · SuperAGI
 *   MetaGPT · SmolAgents · Agno · Linux Foundation AAIF
 *   Model Context Protocol (MCP) · n8n · Zapier · Make (Integromat)
 */

// ── Base Bridge ────────────────────────────────────────────────────────────────

class BaseBridge {
  constructor(name, opts = {}) {
    this.name  = name;
    this.debug = opts.debug || false;
  }

  log(...args) { if (this.debug) console.log(`[Bridge:${this.name}]`, ...args); }

  /** Wrap an external call result as a Munesoft Intent */
  _intent(action, params, raw = "") {
    return { action, params: params || {}, confidence: 0.9, raw };
  }

  _unknown(raw = "") {
    return { action: "unknown", params: {}, confidence: 0, raw };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LANGCHAIN BRIDGE
// Exposes Munesoft tools as LangChain DynamicStructuredTool instances
// and wraps LangChain agents as Munesoft tool handlers.
// ══════════════════════════════════════════════════════════════════════════════

class LangChainBridge extends BaseBridge {
  constructor(opts = {}) { super("LangChain", opts); }

  /**
   * Convert a Munesoft tool registry into LangChain DynamicStructuredTools.
   * Use in LangChain: `const tools = bridge.toTools(agent.registry)`
   */
  toTools(registry) {
    this.log("Exporting tools to LangChain format");
    return registry.list().map(t => ({
      name:        t.name,
      description: t.description,
      schema:      this._schemaToZod(t.schema),
      func:        async (args) => {
        const tool   = registry.get(t.name);
        const result = await tool.handler(args, {});
        return JSON.stringify(result);
      },
      // LangChain DynamicStructuredTool compatible shape
      _type: "DynamicStructuredTool",
    }));
  }

  /**
   * Wrap a LangChain agent executor as a Munesoft-compatible LLM provider.
   * The LangChain agent handles the intent resolution.
   */
  fromAgent(langchainAgent) {
    this.log("Wrapping LangChain agent as LLM provider");
    return {
      async complete({ user }) {
        const result = await langchainAgent.invoke({ input: user });
        return result.output || result.text || JSON.stringify(result);
      },
      async functionCall({ user, tools }) {
        const result = await langchainAgent.invoke({ input: user });
        const output = result.output || "";
        // Parse tool call from LangChain output if structured
        if (result.toolCalls?.length) {
          const c = result.toolCalls[0];
          return { action: c.name, params: c.args || {}, confidence: 0.9, raw: user };
        }
        return { action: "unknown", params: { response: output }, confidence: 0, raw: user };
      },
    };
  }

  /**
   * Convert a Munesoft agent into a LangChain-compatible Tool object.
   */
  fromMunesoftAgent(agent, name, description) {
    this.log(`Wrapping Munesoft agent as LangChain tool: ${name}`);
    return {
      name, description,
      func: async (input) => {
        const result = await agent.run(input);
        return JSON.stringify(result.output || result.error?.message || "No output");
      },
    };
  }

  /** Minimal Zod-like schema shape for LangChain compatibility */
  _schemaToZod(schema) {
    return schema; // LangChain accepts plain JSON schema too
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LANGGRAPH BRIDGE
// Exposes Munesoft agents as LangGraph nodes
// ══════════════════════════════════════════════════════════════════════════════

class LangGraphBridge extends BaseBridge {
  constructor(opts = {}) { super("LangGraph", opts); }

  /**
   * Wrap a Munesoft agent as a LangGraph StateGraph node function.
   * Usage: graph.addNode("myAgent", bridge.toNode(agent))
   */
  toNode(agent) {
    this.log("Exporting Munesoft agent as LangGraph node");
    return async (state) => {
      const input  = state.messages?.at(-1)?.content || state.input || "";
      const result = await agent.run(input, { langGraphState: state });
      return {
        ...state,
        messages: [
          ...(state.messages || []),
          { role: "ai", content: JSON.stringify(result.output || result.error?.message) },
        ],
        lastOutput: result.output,
        lastTool:   result.tool,
        success:    result.success,
      };
    };
  }

  /**
   * Wrap a LangGraph compiled graph as a Munesoft tool handler.
   */
  fromGraph(graph, name, description) {
    this.log(`Wrapping LangGraph graph as Munesoft tool: ${name}`);
    return {
      name, description,
      schema: { input: "string" },
      handler: async ({ input }) => {
        const result = await graph.invoke({ messages: [{ role: "human", content: input }] });
        return { output: result.messages?.at(-1)?.content || result };
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CREWAI BRIDGE
// Wrap Munesoft agents as CrewAI Agents/Tasks and vice versa
// ══════════════════════════════════════════════════════════════════════════════

class CrewAIBridge extends BaseBridge {
  constructor(opts = {}) { super("CrewAI", opts); }

  /**
   * Convert Munesoft tools into CrewAI-compatible tool definitions.
   */
  toCrewTools(registry) {
    this.log("Exporting tools to CrewAI format");
    return registry.list().map(t => ({
      name:        t.name,
      description: t.description,
      // CrewAI tools are callables with .run(input)
      run: async (input) => {
        const tool   = registry.get(t.name);
        const args   = typeof input === "string" ? { input } : input;
        const result = await tool.handler(args, {});
        return JSON.stringify(result);
      },
    }));
  }

  /**
   * Wrap a Munesoft agent as a CrewAI Agent-compatible object.
   */
  toCrewAgent(agent, config = {}) {
    this.log("Exporting Munesoft agent to CrewAI format");
    return {
      role:        config.role        || "AI Agent",
      goal:        config.goal        || "Complete the assigned task",
      backstory:   config.backstory   || "A reliable Munesoft-powered AI agent",
      tools:       this.toCrewTools(agent.registry),
      execute_task: async (task) => {
        const result = await agent.run(task.description || task);
        return JSON.stringify(result.output || result.error?.message);
      },
    };
  }

  /**
   * Wrap a CrewAI crew as a Munesoft tool.
   */
  fromCrew(crew, name, description) {
    this.log(`Wrapping CrewAI crew as Munesoft tool: ${name}`);
    return {
      name, description,
      schema: { task: "string" },
      handler: async ({ task }) => {
        const result = await crew.kickoff({ inputs: { task } });
        return { result: result.raw || JSON.stringify(result) };
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MICROSOFT AUTOGEN BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class AutoGenBridge extends BaseBridge {
  constructor(opts = {}) { super("AutoGen", opts); }

  /**
   * Wrap Munesoft agent as AutoGen-compatible function map entry.
   */
  toFunctionMap(registry) {
    this.log("Exporting tools to AutoGen function map");
    const functionMap = {};
    for (const t of registry.list()) {
      functionMap[t.name] = async (args) => {
        const tool   = registry.get(t.name);
        const result = await tool.handler(args, {});
        return JSON.stringify(result);
      };
    }
    return functionMap;
  }

  /**
   * AutoGen-compatible tool schema list for agent config.
   */
  toToolSchemas(registry) {
    return registry.list().map(t => ({
      type: "function",
      function: {
        name:        t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(Object.entries(t.schema || {}).map(([k, d]) => [k, { type: typeof d === "string" ? d : d.type || "string" }])),
          required:   Object.entries(t.schema || {}).filter(([, d]) => typeof d === "string" ? true : d.required !== false).map(([k]) => k),
        },
      },
    }));
  }

  /**
   * Wrap an AutoGen agent as a Munesoft tool handler.
   */
  fromAgent(autogenAgent, name, description) {
    this.log(`Wrapping AutoGen agent as Munesoft tool: ${name}`);
    return {
      name, description,
      schema: { message: "string" },
      handler: async ({ message }) => {
        const result = await autogenAgent.run(message);
        return { response: result.summary || result };
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// OPENAI AGENTS SDK BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class OpenAIAgentsBridge extends BaseBridge {
  constructor(opts = {}) { super("OpenAIAgents", opts); }

  /**
   * Export Munesoft tools as OpenAI Agents SDK tool definitions.
   */
  toTools(registry) {
    this.log("Exporting to OpenAI Agents SDK tool format");
    return registry.list().map(t => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(Object.entries(t.schema || {}).map(([k, d]) => [k, { type: typeof d === "string" ? d : d.type || "string", description: typeof d === "object" ? d.description || k : k }])),
        required:   Object.entries(t.schema || {}).filter(([, d]) => typeof d === "string" ? true : d.required !== false).map(([k]) => k),
      },
      execute: async (args) => {
        const tool   = registry.get(t.name);
        const result = await tool.handler(args, {});
        return JSON.stringify(result);
      },
    }));
  }

  /**
   * Wrap an OpenAI Agents SDK Runner as a Munesoft LLM provider.
   */
  fromRunner(runner) {
    this.log("Wrapping OpenAI Agents SDK runner as LLM provider");
    return {
      async complete({ user }) {
        const result = await runner.run(user);
        return result.finalOutput || result;
      },
      async functionCall({ user, tools }) {
        const result = await runner.run(user);
        if (result.toolCalls?.length) {
          const c = result.toolCalls[0];
          return { action: c.function.name, params: JSON.parse(c.function.arguments || "{}"), confidence: 0.95, raw: user };
        }
        return { action: "unknown", params: {}, confidence: 0, raw: user };
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// OPENAI SWARM BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class SwarmBridge extends BaseBridge {
  constructor(opts = {}) { super("OpenAISwarm", opts); }

  /**
   * Export Munesoft agent as an OpenAI Swarm Agent definition.
   */
  toSwarmAgent(agent, config = {}) {
    this.log("Exporting Munesoft agent as Swarm agent");
    return {
      name:         config.name         || "Munesoft Agent",
      instructions: config.instructions || "Complete the user's request using available tools.",
      functions:    agent.registry.list().map(t => {
        const fn = async (args) => {
          const result = await agent.run(JSON.stringify(args));
          return JSON.stringify(result.output || result.error?.message);
        };
        fn.__name        = t.name;
        fn.__description = t.description;
        fn.__schema      = t.schema;
        return fn;
      }),
    };
  }

  /**
   * Wrap a Swarm client as a Munesoft tool.
   */
  fromSwarm(swarmClient, agentDef, name, description) {
    this.log(`Wrapping Swarm as Munesoft tool: ${name}`);
    return {
      name, description,
      schema: { message: "string" },
      handler: async ({ message }) => {
        const result = await swarmClient.run({ agent: agentDef, messages: [{ role: "user", content: message }] });
        return { response: result.messages?.at(-1)?.content || result };
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LLAMAINDEX BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class LlamaIndexBridge extends BaseBridge {
  constructor(opts = {}) { super("LlamaIndex", opts); }

  /**
   * Export Munesoft tools as LlamaIndex FunctionTool definitions.
   */
  toTools(registry) {
    this.log("Exporting to LlamaIndex tool format");
    return registry.list().map(t => ({
      metadata: { name: t.name, description: t.description,
        fn_schema: { type: "object", properties: Object.fromEntries(Object.entries(t.schema || {}).map(([k, d]) => [k, { type: typeof d === "string" ? d : d.type || "string" }])) } },
      call: async (kwargs) => {
        const tool   = registry.get(t.name);
        const result = await tool.handler(kwargs, {});
        return JSON.stringify(result);
      },
    }));
  }

  /**
   * Wrap a LlamaIndex query engine as a Munesoft tool.
   */
  fromQueryEngine(queryEngine, name, description) {
    this.log(`Wrapping LlamaIndex query engine as tool: ${name}`);
    return {
      name, description,
      schema: { query: "string" },
      handler: async ({ query }) => {
        const response = await queryEngine.query(query);
        return { answer: response.toString(), sourceNodes: response.sourceNodes?.map(n => n.text) || [] };
      },
    };
  }

  /**
   * Wrap a LlamaIndex agent as a Munesoft LLM provider.
   */
  fromAgent(llamaAgent) {
    return {
      async complete({ user }) {
        const result = await llamaAgent.chat({ message: user });
        return result.response || "";
      },
      async functionCall({ user, tools }) {
        const result = await llamaAgent.chat({ message: user });
        return { action: "unknown", params: { response: result.response || "" }, confidence: 0, raw: user };
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SEMANTIC KERNEL BRIDGE (Microsoft)
// ══════════════════════════════════════════════════════════════════════════════

class SemanticKernelBridge extends BaseBridge {
  constructor(opts = {}) { super("SemanticKernel", opts); }

  /**
   * Export Munesoft tools as Semantic Kernel KernelFunction-compatible objects.
   */
  toKernelFunctions(registry) {
    this.log("Exporting to Semantic Kernel format");
    return registry.list().map(t => ({
      name:        t.name,
      description: t.description,
      parameters:  Object.entries(t.schema || {}).map(([name, d]) => ({
        name, description: typeof d === "object" ? d.description || name : name,
        type: typeof d === "string" ? d : d.type || "string",
        isRequired: typeof d === "string" ? true : d.required !== false,
      })),
      invoke: async (context) => {
        const tool   = registry.get(t.name);
        const args   = Object.fromEntries(Object.keys(t.schema || {}).map(k => [k, context.variables.get(k)]));
        const result = await tool.handler(args, {});
        return JSON.stringify(result);
      },
    }));
  }

  /**
   * Wrap a Semantic Kernel instance as a Munesoft LLM provider.
   */
  fromKernel(kernel, functionName) {
    this.log("Wrapping Semantic Kernel as LLM provider");
    return {
      async complete({ user }) {
        const result = await kernel.invokeAsync(functionName, { input: user });
        return result.getStringResult?.() || result.toString();
      },
      async functionCall({ user }) {
        return { action: "unknown", params: {}, confidence: 0, raw: user };
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HAYSTACK BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class HaystackBridge extends BaseBridge {
  constructor(opts = {}) { super("Haystack", opts); }

  /**
   * Wrap Munesoft tools as Haystack ComponentBase-compatible tools.
   */
  toComponents(registry) {
    this.log("Exporting to Haystack component format");
    return registry.list().map(t => ({
      name:        t.name,
      description: t.description,
      input_types:  Object.fromEntries(Object.entries(t.schema || {}).map(([k, d]) => [k, typeof d === "string" ? d : d.type || "string"])),
      output_types: { result: "Any" },
      run: async (args) => {
        const tool   = registry.get(t.name);
        const result = await tool.handler(args, {});
        return { result };
      },
    }));
  }

  /**
   * Wrap a Haystack pipeline as a Munesoft tool.
   */
  fromPipeline(pipeline, name, description) {
    this.log(`Wrapping Haystack pipeline as tool: ${name}`);
    return {
      name, description,
      schema: { query: "string" },
      handler: async ({ query }) => {
        const result = await pipeline.run({ query });
        return { answer: result.answers?.[0]?.answer || JSON.stringify(result) };
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MODEL CONTEXT PROTOCOL (MCP) BRIDGE
// Anthropic's open standard for tool/resource connectivity
// ══════════════════════════════════════════════════════════════════════════════

class MCPBridge extends BaseBridge {
  constructor(opts = {}) {
    super("MCP", opts);
    this.serverUrl = opts.serverUrl || null;
    this.transport = opts.transport || "stdio"; // "stdio" | "http" | "sse"
  }

  /**
   * Export Munesoft tools as MCP ToolDefinition objects (servers can serve these).
   */
  toMCPTools(registry) {
    this.log("Exporting tools as MCP ToolDefinitions");
    return {
      tools: registry.list().map(t => ({
        name:        t.name,
        description: t.description,
        inputSchema: {
          type: "object",
          properties: Object.fromEntries(Object.entries(t.schema || {}).map(([k, d]) => {
            const def = typeof d === "string" ? { type: d } : d;
            return [k, { type: def.type || "string", description: def.description || k }];
          })),
          required: Object.entries(t.schema || {}).filter(([, d]) => typeof d === "string" ? true : d.required !== false).map(([k]) => k),
        },
      })),
    };
  }

  /**
   * Create an MCP server handler that routes tool_call requests to Munesoft tools.
   * Compatible with @modelcontextprotocol/sdk server setup.
   */
  createServerHandler(registry) {
    this.log("Creating MCP server handler");
    return {
      // Called when MCP client requests tool list
      listTools: async () => this.toMCPTools(registry),

      // Called when MCP client invokes a tool
      callTool: async ({ name, arguments: args }) => {
        const tool = registry.get(name);
        if (!tool) return { content: [{ type: "text", text: `Tool "${name}" not found` }], isError: true };
        try {
          const result = await tool.handler(args, {});
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (err) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
      },
    };
  }

  /**
   * Consume an MCP server's tools and register them as Munesoft tools.
   * @param {object} mcpClient - Connected MCP client instance
   * @param {object} registry  - Munesoft ToolRegistry to register into
   */
  async importFromServer(mcpClient, registry) {
    this.log("Importing MCP tools into Munesoft registry");
    const { tools } = await mcpClient.listTools();
    for (const mcpTool of tools) {
      const schema = {};
      for (const [k, v] of Object.entries(mcpTool.inputSchema?.properties || {})) {
        schema[k] = { type: v.type || "string", description: v.description || k,
          required: (mcpTool.inputSchema?.required || []).includes(k) };
      }
      if (!registry.has(mcpTool.name)) {
        registry.register({
          name:        mcpTool.name,
          description: mcpTool.description || mcpTool.name,
          schema,
          handler: async (args) => {
            const result = await mcpClient.callTool({ name: mcpTool.name, arguments: args });
            return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
          },
          options: { tags: ["mcp"] },
        });
        this.log(`Imported MCP tool: ${mcpTool.name}`);
      }
    }
    return registry;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// N8N BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class N8NBridge extends BaseBridge {
  constructor(opts = {}) {
    super("n8n", opts);
    this.webhookUrl = opts.webhookUrl || process.env.N8N_WEBHOOK_URL;
    this.apiKey     = opts.apiKey     || process.env.N8N_API_KEY;
  }

  /**
   * Call an n8n webhook workflow with data.
   * Returns a Munesoft tool handler.
   */
  webhookTool(name, description, webhookUrl) {
    const url      = webhookUrl || this.webhookUrl;
    const apiKey   = this.apiKey;
    const bridge   = this;
    const parsedUrl = new URL(url);
    return {
      name, description,
      schema: { data: { type: "object", required: false } },
      handler: async ({ data = {} }) => {
        bridge.log(`Calling n8n webhook: ${url}`);
        const result = await bridge._postAny(parsedUrl.hostname, parsedUrl.pathname, apiKey ? { "X-N8N-API-KEY": apiKey } : {}, data);
        return result;
      },
      options: { tags: ["n8n", "webhook"] },
    };
  }

  /**
   * Export a Munesoft agent as an n8n HTTP tool node definition (JSON).
   * Import this JSON into your n8n workflow.
   */
  exportNodeDefinition(agent, baseUrl) {
    this.log("Exporting Munesoft agent as n8n node definition");
    return {
      type: "n8n-nodes-base.httpRequest",
      name: "Munesoft Agent",
      parameters: {
        method: "POST",
        url:    `${baseUrl}/agent/run`,
        sendBody: true,
        bodyParameters: { parameters: [{ name: "input", value: "={{ $json.input }}" }] },
      },
    };
  }

  async _postAny(hostname, path, headers, body) {
    const https   = require("https");
    const http    = require("http");
    const isHttps = hostname.startsWith("https") || !hostname.startsWith("http");
    const lib     = isHttps ? https : http;
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = lib.request({ hostname, path, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers } }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
      });
      req.on("error", reject); req.write(payload); req.end();
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ZAPIER BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class ZapierBridge extends BaseBridge {
  constructor(opts = {}) {
    super("Zapier", opts);
    this.nlaApiKey = opts.nlaApiKey || process.env.ZAPIER_NLA_API_KEY;
  }

  /**
   * Call a Zapier NLA (Natural Language Actions) action.
   */
  nlaTool(name, description, actionId) {
    const apiKey = this.nlaApiKey;
    const bridge = this;
    return {
      name, description,
      schema: { instructions: "string", params: { type: "object", required: false } },
      handler: async ({ instructions, params = {} }) => {
        bridge.log(`Calling Zapier NLA action: ${actionId}`);
        const body = { instructions, ...params };
        const data = await bridge._postNLA(`/api/v1/exposed/${actionId}/execute/`, body, apiKey);
        return { result: data.result || data, status: data.status };
      },
      options: { tags: ["zapier", "automation"] },
    };
  }

  /**
   * List available Zapier NLA actions and register them as Munesoft tools.
   */
  async importActions(registry) {
    this.log("Importing Zapier NLA actions");
    const data = await this._postNLA("/api/v1/exposed/", null, this.nlaApiKey, "GET");
    for (const action of data.results || []) {
      if (!registry.has(action.id)) {
        registry.register({
          name:        action.id,
          description: action.description || action.operation_id,
          schema:      { instructions: "string" },
          handler: async ({ instructions }) => {
            const result = await this._postNLA(`/api/v1/exposed/${action.id}/execute/`, { instructions }, this.nlaApiKey);
            return result;
          },
          options: { tags: ["zapier"] },
        });
      }
    }
    return registry;
  }

  async _postNLA(path, body, apiKey, method = "POST") {
    const https   = require("https");
    const payload = body ? JSON.stringify(body) : "";
    return new Promise((resolve, reject) => {
      const opts = { hostname: "nla.zapier.com", path, method, headers: { "Content-Type": "application/json", "X-API-Key": apiKey, ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) } };
      const req  = https.request(opts, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } }); });
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAKE (INTEGROMAT) BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class MakeBridge extends BaseBridge {
  constructor(opts = {}) {
    super("Make", opts);
    this.apiKey  = opts.apiKey  || process.env.MAKE_API_KEY;
    this.region  = opts.region  || "eu1"; // eu1 | us1 | ap1
  }

  /**
   * Trigger a Make scenario webhook.
   */
  webhookTool(name, description, webhookUrl) {
    const bridge = this;
    const parsed = new URL(webhookUrl);
    return {
      name, description,
      schema: { data: { type: "object", required: false } },
      handler: async ({ data = {} }) => {
        bridge.log(`Triggering Make webhook: ${webhookUrl}`);
        const result = await bridge._post(parsed.hostname, parsed.pathname, {}, data);
        return { triggered: true, result };
      },
      options: { tags: ["make", "automation"] },
    };
  }

  async _post(hostname, path, headers, body) {
    const https   = require("https");
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname, path, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers } }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
      });
      req.on("error", reject); req.write(payload); req.end();
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SMOLAGENTS BRIDGE (Hugging Face)
// ══════════════════════════════════════════════════════════════════════════════

class SmolAgentsBridge extends BaseBridge {
  constructor(opts = {}) { super("SmolAgents", opts); }

  /**
   * Export Munesoft tools as SmolAgents Tool-compatible objects.
   */
  toTools(registry) {
    this.log("Exporting to SmolAgents tool format");
    return registry.list().map(t => ({
      name:        t.name,
      description: t.description,
      inputs:      Object.fromEntries(Object.entries(t.schema || {}).map(([k, d]) => [k, { type: typeof d === "string" ? d : d.type || "string", description: typeof d === "object" ? d.description || k : k }])),
      output_type: "any",
      forward: async (args) => {
        const tool   = registry.get(t.name);
        const result = await tool.handler(args, {});
        return JSON.stringify(result);
      },
    }));
  }

  /**
   * Wrap a SmolAgents agent as a Munesoft LLM provider.
   */
  fromAgent(smolAgent) {
    return {
      async complete({ user }) {
        const result = await smolAgent.run(user);
        return typeof result === "string" ? result : JSON.stringify(result);
      },
      async functionCall({ user }) {
        return { action: "unknown", params: {}, confidence: 0, raw: user };
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AGNO BRIDGE (formerly phidata)
// ══════════════════════════════════════════════════════════════════════════════

class AgnoBridge extends BaseBridge {
  constructor(opts = {}) { super("Agno", opts); }

  toTools(registry) {
    this.log("Exporting to Agno tool format");
    return registry.list().map(t => ({
      name:        t.name,
      description: t.description,
      parameters:  t.schema || {},
      entrypoint:  async (args) => {
        const tool   = registry.get(t.name);
        const result = await tool.handler(args, {});
        return JSON.stringify(result);
      },
    }));
  }

  fromAgent(agnoAgent, name, description) {
    this.log(`Wrapping Agno agent as Munesoft tool: ${name}`);
    return {
      name, description,
      schema: { message: "string" },
      handler: async ({ message }) => {
        const result = await agnoAgent.run(message);
        return { response: result.content || result };
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// METAGPT BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class MetaGPTBridge extends BaseBridge {
  constructor(opts = {}) { super("MetaGPT", opts); }

  toAction(tool) {
    this.log(`Exporting tool "${tool.name}" as MetaGPT Action`);
    return {
      name: tool.name,
      desc: tool.description,
      run:  async (args) => {
        const result = await tool.handler(args, {});
        return JSON.stringify(result);
      },
    };
  }

  fromRole(role, name, description) {
    this.log(`Wrapping MetaGPT role as Munesoft tool: ${name}`);
    return {
      name, description,
      schema: { instruction: "string" },
      handler: async ({ instruction }) => {
        const result = await role.run(instruction);
        return { output: result };
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOWISE BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class FlowiseBridge extends BaseBridge {
  constructor(opts = {}) {
    super("Flowise", opts);
    this.apiUrl = opts.apiUrl || process.env.FLOWISE_API_URL;
    this.apiKey = opts.apiKey || process.env.FLOWISE_API_KEY;
  }

  /**
   * Call a Flowise prediction endpoint as a Munesoft tool.
   */
  chatflowTool(name, description, chatflowId) {
    const bridge = this;
    return {
      name, description,
      schema: { question: "string", history: { type: "array", required: false } },
      handler: async ({ question, history = [] }) => {
        bridge.log(`Calling Flowise chatflow: ${chatflowId}`);
        const url    = new URL(`${bridge.apiUrl}/api/v1/prediction/${chatflowId}`);
        const body   = { question, history };
        const result = await bridge._post(url.hostname, url.pathname, bridge.apiKey ? { Authorization: `Bearer ${bridge.apiKey}` } : {}, body);
        return { answer: result.text || result.answer || JSON.stringify(result) };
      },
      options: { tags: ["flowise"] },
    };
  }

  async _post(hostname, path, headers, body) {
    const https   = require("https");
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname, path, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers } }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
      });
      req.on("error", reject); req.write(payload); req.end();
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUPERAGI BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class SuperAGIBridge extends BaseBridge {
  constructor(opts = {}) {
    super("SuperAGI", opts);
    this.apiUrl = opts.apiUrl || process.env.SUPERAGI_API_URL;
    this.apiKey = opts.apiKey || process.env.SUPERAGI_API_KEY;
  }

  toToolkitTools(registry) {
    this.log("Exporting to SuperAGI Toolkit format");
    return registry.list().map(t => ({
      name:        t.name,
      description: t.description,
      args_schema: t.schema,
      execute:     async (args) => {
        const tool   = registry.get(t.name);
        const result = await tool.handler(args, {});
        return JSON.stringify(result);
      },
    }));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LINUX FOUNDATION AAIF BRIDGE
// AI Alliance Interoperability Framework — open standard for agent-to-agent comms
// ══════════════════════════════════════════════════════════════════════════════

class AAIFBridge extends BaseBridge {
  constructor(opts = {}) {
    super("AAIF", opts);
    this.agentId  = opts.agentId  || `munesoft-agent-${Date.now()}`;
    this.endpoint = opts.endpoint || null;
  }

  /**
   * Export Munesoft agent as an AAIF Agent Card (standardized discovery manifest).
   */
  toAgentCard(agent, config = {}) {
    this.log("Generating AAIF Agent Card");
    return {
      schemaVersion:  "1.0",
      id:             config.id       || this.agentId,
      name:           config.name     || "Munesoft Agent",
      description:    config.description || "A Munesoft-powered AI agent",
      version:        config.version  || "1.10.10",
      provider: { name: "Munesoft", url: "https://github.com/munesoft/agent" },
      capabilities: {
        streaming:    true,
        functionCalling: true,
        multiAgent:   true,
        memory:       true,
      },
      skills: agent.registry.list().map(t => ({
        id:          t.name,
        name:        t.name,
        description: t.description,
        inputSchema: {
          type: "object",
          properties: Object.fromEntries(Object.entries(t.schema || {}).map(([k, d]) => [k, { type: typeof d === "string" ? d : d.type || "string" }])),
        },
      })),
      endpoints: this.endpoint ? [{ protocol: "http", url: this.endpoint }] : [],
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Wrap an AAIF-compatible remote agent as a Munesoft tool.
   */
  fromRemoteAgent(agentCard, name, description) {
    this.log(`Wrapping AAIF remote agent as tool: ${name}`);
    const endpoint = agentCard.endpoints?.[0]?.url;
    const bridge   = this;
    return {
      name:        name || agentCard.name,
      description: description || agentCard.description,
      schema:      { input: "string", skill: { type: "string", required: false } },
      handler: async ({ input, skill }) => {
        if (!endpoint) throw new Error(`AAIF agent "${agentCard.name}" has no endpoint configured`);
        const url  = new URL(endpoint + "/run");
        const body = { input, skill };
        bridge.log(`Calling AAIF remote agent at ${endpoint}`);
        const https   = require("https");
        const payload = JSON.stringify(body);
        return new Promise((resolve, reject) => {
          const req = https.request({ hostname: url.hostname, path: url.pathname, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, res => {
            let d = ""; res.on("data", c => d += c);
            res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
          });
          req.on("error", reject); req.write(payload); req.end();
        });
      },
      options: { tags: ["aaif", "remote"] },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// OPENDEVIN / ALL-HANDS BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class OpenDevinBridge extends BaseBridge {
  constructor(opts = {}) { super("OpenDevin", opts); }

  toTools(registry) {
    this.log("Exporting to OpenDevin tool format");
    return registry.list().map(t => ({
      function: {
        name:        t.name,
        description: t.description,
        parameters:  {
          type: "object",
          properties: Object.fromEntries(Object.entries(t.schema || {}).map(([k, d]) => [k, { type: typeof d === "string" ? d : d.type || "string" }])),
          required:   Object.entries(t.schema || {}).filter(([, d]) => typeof d === "string" ? true : d.required !== false).map(([k]) => k),
        },
      },
      execute: async (args) => {
        const tool   = registry.get(t.name);
        const result = await tool.handler(args, {});
        return { type: "tool_result", content: JSON.stringify(result) };
      },
    }));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENTGPT BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class AgentGPTBridge extends BaseBridge {
  constructor(opts = {}) { super("AgentGPT", opts); }

  toTasks(registry) {
    this.log("Exporting to AgentGPT task format");
    return registry.list().map(t => ({
      taskDescription: t.description,
      tool:            t.name,
      execute:         async (taskInput) => {
        const tool   = registry.get(t.name);
        const args   = typeof taskInput === "string" ? { input: taskInput } : taskInput;
        const result = await tool.handler(args, {});
        return { result: JSON.stringify(result), completed: true };
      },
    }));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DUST BRIDGE
// ══════════════════════════════════════════════════════════════════════════════

class DustBridge extends BaseBridge {
  constructor(opts = {}) {
    super("Dust", opts);
    this.apiKey    = opts.apiKey    || process.env.DUST_API_KEY;
    this.workspaceId = opts.workspaceId || process.env.DUST_WORKSPACE_ID;
  }

  /**
   * Wrap a Dust app as a Munesoft tool.
   */
  appTool(name, description, appId, specHash) {
    const bridge = this;
    return {
      name, description,
      schema: { input: { type: "object", required: false } },
      handler: async ({ input = {} }) => {
        bridge.log(`Running Dust app: ${appId}`);
        const https   = require("https");
        const body    = { specification_hash: specHash, config: {}, inputs: [input] };
        const payload = JSON.stringify(body);
        return new Promise((resolve, reject) => {
          const req = https.request({ hostname: "dust.tt", path: `/api/v1/w/${bridge.workspaceId}/apps/${appId}/runs`, method: "POST", headers: { "Authorization": `Bearer ${bridge.apiKey}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, res => {
            let d = ""; res.on("data", c => d += c);
            res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
          });
          req.on("error", reject); req.write(payload); req.end();
        });
      },
      options: { tags: ["dust"] },
    };
  }
}

module.exports = {
  LangChainBridge, LangGraphBridge, CrewAIBridge, AutoGenBridge,
  OpenAIAgentsBridge, SwarmBridge, LlamaIndexBridge, SemanticKernelBridge,
  HaystackBridge, MCPBridge, N8NBridge, ZapierBridge, MakeBridge,
  SmolAgentsBridge, AgnoBridge, MetaGPTBridge, FlowiseBridge,
  SuperAGIBridge, AAIFBridge, OpenDevinBridge, AgentGPTBridge, DustBridge,
};
