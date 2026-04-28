"use strict";

const { IntentParser }    = require("../intent");
const { ToolRegistry }    = require("../tools");
const { ActionRouter }    = require("../router");
const { ExecutionEngine } = require("./execution");
const { MemoryLayer }     = require("../memory");
const { Guardrails }      = require("../guardrails");
const { EventBus }        = require("../events");

/**
 * @munesoft/agent — Core Agent
 * intent → guardrails → route → execute → memory → events → response
 */

function createAgent(config = {}) {
  const debug = config.debug || false;

  // Registry
  const registry = new ToolRegistry();
  for (const tool of config.tools || []) registry.register(tool);

  // Intent parser — wire LLM if provided
  const parser = new IntentParser({
    llmProvider:        config.llmProvider || null,
    fallbackRules:      config.rules       || [],
    useFunctionCalling: config.useFunctionCalling !== false,
    debug,
  });

  // Router, engine
  const router = new ActionRouter(registry, { debug });
  const engine = new ExecutionEngine({ ...(config.execution || {}), debug });

  // Memory
  const memory = config.memory instanceof MemoryLayer
    ? config.memory
    : new MemoryLayer(config.memory || {});

  // Guardrails
  let guardrails = null;
  if (config.guardrails !== false) {
    guardrails = config.guardrails instanceof Guardrails
      ? config.guardrails
      : new Guardrails(typeof config.guardrails === "object" ? config.guardrails : {});
  }

  // Event bus — per-agent or shared
  const events = config.events instanceof EventBus ? config.events : new EventBus();

  return new Agent({ registry, parser, router, engine, memory, guardrails, events, debug });
}

class Agent {
  constructor({ registry, parser, router, engine, memory, guardrails, events, debug }) {
    this.registry   = registry;
    this.parser     = parser;
    this.router     = router;
    this.engine     = engine;
    this.memory     = memory;
    this.guardrails = guardrails;
    this.events     = events;
    this.debug      = debug;
    this._middlewares = [];
    this._onError     = null;
  }

  /**
   * Run the full pipeline with a natural language input.
   * @param {string} input
   * @param {object} context
   * @returns {Promise<AgentResponse>}
   */
  async run(input, context = {}) {
    const sessionId  = context.sessionId || `sess_${Date.now()}`;
    const runContext = { ...context, agent: this, memory: this.memory, sessionId };
    const start      = Date.now();

    this.events.emit("agent.run", { input, sessionId });

    try {
      // Step 1 — Sanitize
      const sanitized = this.guardrails
        ? this.guardrails.sanitizeInput(input)
        : (typeof input === "string" ? input.trim() : String(input));

      this.memory.addMessage("user", sanitized);

      // Step 2 — Middleware
      let processed = sanitized;
      for (const mw of this._middlewares) processed = (await mw(processed, runContext)) || processed;

      // Step 3 — Parse intent
      const intent = await this.parser.parse(processed, this.registry.list());
      if (this.debug) console.log("[Agent] Intent:", intent);
      this.events.emit("intent.parsed", { intent, sessionId });

      // Step 4 — Validate intent
      if (this.guardrails) this.guardrails.validateIntent(intent);

      // Step 5 — Route
      const { tool, args } = this.router.route(intent);
      this.events.emit("tool.selected", { tool: tool.name, args, sessionId });

      // Step 6 — Execute
      const result = await this.engine.execute(tool, args, runContext);
      this.events.emit("tool.executed", { tool: tool.name, success: result.success, duration: result.duration, sessionId });

      // Step 7 — Validate output
      if (this.guardrails && result.success) this.guardrails.validateOutput(result, tool);

      // Step 8 — Memory
      this.memory.set("last_action", tool.name);
      this.memory.set("last_result", result.toJSON());
      this.memory.addMessage("agent", result.success ? `Executed ${tool.name} successfully.` : `Failed: ${result.error?.message}`);
      this.events.emit("memory.updated", { keys: ["last_action", "last_result"], sessionId });

      return new AgentResponse({
        success: result.success, input: sanitized, intent, tool: tool.name,
        output: result.output, error: result.error, duration: Date.now() - start, sessionId,
      });

    } catch (err) {
      this.events.emit("agent.error", { error: err.message, sessionId });
      if (this._onError) {
        const handled = await this._onError(err, { input, context: runContext });
        if (handled) return handled;
      }
      return new AgentResponse({ success: false, input, intent: null, tool: null, output: null, error: err, duration: Date.now() - start, sessionId });
    }
  }

  /**
   * Stream the agent run — emits events as each stage completes.
   * Useful for real-time UIs. Returns a final AgentResponse.
   * @param {string} input
   * @param {Function} onEvent - (stage, data) => void
   */
  async stream(input, onEvent = () => {}, context = {}) {
    const emit = (stage, data) => { onEvent(stage, data); };
    emit("start", { input });

    const sessionId  = context.sessionId || `sess_${Date.now()}`;
    const runContext = { ...context, agent: this, memory: this.memory, sessionId };
    const start      = Date.now();

    try {
      const sanitized = this.guardrails ? this.guardrails.sanitizeInput(input) : input.trim();
      emit("sanitized", { input: sanitized });
      this.memory.addMessage("user", sanitized);

      let processed = sanitized;
      for (const mw of this._middlewares) processed = (await mw(processed, runContext)) || processed;

      const intent = await this.parser.parse(processed, this.registry.list());
      emit("intent", { intent });
      if (this.guardrails) this.guardrails.validateIntent(intent);

      const { tool, args } = this.router.route(intent);
      emit("routing", { tool: tool.name, args });

      const result = await this.engine.execute(tool, args, runContext);
      emit("executed", { tool: tool.name, success: result.success, output: result.output });

      this.memory.set("last_action", tool.name);
      this.memory.set("last_result", result.toJSON());
      this.memory.addMessage("agent", result.success ? `Done: ${tool.name}` : `Error: ${result.error?.message}`);

      const response = new AgentResponse({
        success: result.success, input: sanitized, intent, tool: tool.name,
        output: result.output, error: result.error, duration: Date.now() - start, sessionId,
      });
      emit("done", { response });
      return response;

    } catch (err) {
      emit("error", { error: err.message });
      return new AgentResponse({ success: false, input, intent: null, tool: null, output: null, error: err, duration: Date.now() - start, sessionId });
    }
  }

  // ── Chainable config ───────────────────────────────────────────────────────
  addTool(tool)   { this.registry.register(tool); return this; }
  use(fn)         { if (typeof fn !== "function") throw new Error("Middleware must be a function"); this._middlewares.push(fn); return this; }
  onError(fn)     { this._onError = fn; return this; }

  // ── Inspection ─────────────────────────────────────────────────────────────
  getHistory(n)   { return this.memory.getHistory(n); }
  reset()         { this.memory.clear(); return this; }
  inspect()       {
    return {
      tools:      this.registry.list().map(t => t.name),
      memory:     this.memory.snapshot(),
      guardrails: this.guardrails?.summary() || null,
      history:    this.memory.getHistory(),
    };
  }
}

class AgentResponse {
  constructor({ success, input, intent, tool, output, error, duration, sessionId }) {
    this.success   = success;
    this.input     = input;
    this.intent    = intent;
    this.tool      = tool;
    this.output    = output;
    this.error     = error  || null;
    this.duration  = duration;
    this.sessionId = sessionId;
    this.timestamp = new Date().toISOString();
  }
  toJSON() {
    return { success: this.success, input: this.input, intent: this.intent, tool: this.tool,
      output: this.output, error: this.error ? { message: this.error.message, type: this.error.name } : null,
      duration: this.duration, sessionId: this.sessionId, timestamp: this.timestamp };
  }
}

module.exports = { createAgent, Agent, AgentResponse };
