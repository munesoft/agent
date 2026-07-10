"use strict";

const { IntentParser }    = require("../intent");
const { ToolRegistry }    = require("../tools");
const { ActionRouter }    = require("../router");
const { ExecutionEngine } = require("./execution");
const { MemoryLayer }     = require("../memory");
const { Guardrails }      = require("../guardrails");
const { EventBus }        = require("../events");
<<<<<<< HEAD
const { Verifier }        = require("../verify");

/**
 * @munesoft/agent — Core Agent
 * sanitize → parse intent → guardrails → ROUTE (brain) → execute → VERIFY → repair → memory → events → response
=======

/**
 * @munesoft/agent — Core Agent
 * intent → guardrails → route → execute → memory → events → response
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
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

<<<<<<< HEAD
  // Router brain — accept a prebuilt router or routing options
  const router = config.router instanceof ActionRouter
    ? config.router
    : new ActionRouter(registry, { debug, ...(config.routing || {}) });

  // Execution engine
=======
  // Router, engine
  const router = new ActionRouter(registry, { debug });
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
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

<<<<<<< HEAD
  // Verification (optional) + auto-repair budget
  let verifier = null;
  if (config.verify) {
    verifier = config.verify instanceof Verifier ? config.verify : new Verifier(config.verify);
  }
  const maxRepairs = config.maxRepairs || 0;

  // Event bus — per-agent or shared
  const events = config.events instanceof EventBus ? config.events : new EventBus();

  return new Agent({ registry, parser, router, engine, memory, guardrails, verifier, maxRepairs, events, debug });
}

class Agent {
  constructor({ registry, parser, router, engine, memory, guardrails, verifier, maxRepairs, events, debug }) {
=======
  // Event bus — per-agent or shared
  const events = config.events instanceof EventBus ? config.events : new EventBus();

  return new Agent({ registry, parser, router, engine, memory, guardrails, events, debug });
}

class Agent {
  constructor({ registry, parser, router, engine, memory, guardrails, events, debug }) {
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
    this.registry   = registry;
    this.parser     = parser;
    this.router     = router;
    this.engine     = engine;
    this.memory     = memory;
    this.guardrails = guardrails;
<<<<<<< HEAD
    this.verifier   = verifier || null;
    this.maxRepairs = maxRepairs || 0;
=======
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
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
<<<<<<< HEAD
    const steps      = [];
=======
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf

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

<<<<<<< HEAD
      // Step 5 — Route (brain)
      const { tool, args, decision } = await this.router.route(intent);
      this.events.emit("tool.selected", { tool: tool.name, args, decision, sessionId });

      // Step 6/7 — Execute + verify + (optional) repair loop
      let result, verification = null, repairs = 0;
      while (true) {
        result = await this.engine.execute(tool, args, runContext);
        this.events.emit("tool.executed", { tool: tool.name, success: result.success, duration: result.duration, sessionId });
        steps.push({ attempt: repairs, tool: tool.name, success: result.success, output: result.output });

        // Output guardrails
        if (this.guardrails && result.success) this.guardrails.validateOutput(result, tool);

        // No verifier, or the tool itself errored → nothing to verify/repair
        if (!this.verifier || !result.success) break;

        verification = await this.verifier.verify(result.output, { input: sanitized, tool: tool.name, args });
        this.events.emit("verify.checked", { passed: verification.passed, score: verification.score, feedback: verification.feedback, sessionId });

        if (verification.passed || repairs >= this.maxRepairs) break;

        repairs++;
        this.events.emit("repair.attempt", { attempt: repairs, feedback: verification.feedback, sessionId });
        // Feed the verification failure back into the run context so the tool can adapt.
        runContext._verification = { failed: true, feedback: verification.feedback, previousOutput: result.output };
      }
=======
      // Step 5 — Route
      const { tool, args } = this.router.route(intent);
      this.events.emit("tool.selected", { tool: tool.name, args, sessionId });

      // Step 6 — Execute
      const result = await this.engine.execute(tool, args, runContext);
      this.events.emit("tool.executed", { tool: tool.name, success: result.success, duration: result.duration, sessionId });

      // Step 7 — Validate output
      if (this.guardrails && result.success) this.guardrails.validateOutput(result, tool);
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf

      // Step 8 — Memory
      this.memory.set("last_action", tool.name);
      this.memory.set("last_result", result.toJSON());
      this.memory.addMessage("agent", result.success ? `Executed ${tool.name} successfully.` : `Failed: ${result.error?.message}`);
      this.events.emit("memory.updated", { keys: ["last_action", "last_result"], sessionId });

<<<<<<< HEAD
      const success = result.success && (!verification || verification.passed);
      return new AgentResponse({
        success, input: sanitized, intent, tool: tool.name, decision,
        output: result.output, error: result.error, verification, steps, repairs,
        duration: Date.now() - start, sessionId,
=======
      return new AgentResponse({
        success: result.success, input: sanitized, intent, tool: tool.name,
        output: result.output, error: result.error, duration: Date.now() - start, sessionId,
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
      });

    } catch (err) {
      this.events.emit("agent.error", { error: err.message, sessionId });
      if (this._onError) {
        const handled = await this._onError(err, { input, context: runContext });
        if (handled) return handled;
      }
<<<<<<< HEAD
      return new AgentResponse({ success: false, input, intent: null, tool: null, decision: null, output: null, error: err, verification: null, steps, repairs: 0, duration: Date.now() - start, sessionId });
=======
      return new AgentResponse({ success: false, input, intent: null, tool: null, output: null, error: err, duration: Date.now() - start, sessionId });
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
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
<<<<<<< HEAD
    const steps      = [];
=======
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf

    try {
      const sanitized = this.guardrails ? this.guardrails.sanitizeInput(input) : input.trim();
      emit("sanitized", { input: sanitized });
      this.memory.addMessage("user", sanitized);

      let processed = sanitized;
      for (const mw of this._middlewares) processed = (await mw(processed, runContext)) || processed;

      const intent = await this.parser.parse(processed, this.registry.list());
      emit("intent", { intent });
      if (this.guardrails) this.guardrails.validateIntent(intent);

<<<<<<< HEAD
      const { tool, args, decision } = await this.router.route(intent);
      emit("routing", { tool: tool.name, args, decision });

      let result, verification = null, repairs = 0;
      while (true) {
        result = await this.engine.execute(tool, args, runContext);
        emit("executed", { tool: tool.name, success: result.success, output: result.output });
        steps.push({ attempt: repairs, tool: tool.name, success: result.success, output: result.output });

        if (this.guardrails && result.success) this.guardrails.validateOutput(result, tool);
        if (!this.verifier || !result.success) break;

        verification = await this.verifier.verify(result.output, { input: sanitized, tool: tool.name, args });
        emit("verified", { passed: verification.passed, score: verification.score });
        if (verification.passed || repairs >= this.maxRepairs) break;

        repairs++;
        emit("repair", { attempt: repairs, feedback: verification.feedback });
        runContext._verification = { failed: true, feedback: verification.feedback, previousOutput: result.output };
      }
=======
      const { tool, args } = this.router.route(intent);
      emit("routing", { tool: tool.name, args });

      const result = await this.engine.execute(tool, args, runContext);
      emit("executed", { tool: tool.name, success: result.success, output: result.output });
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf

      this.memory.set("last_action", tool.name);
      this.memory.set("last_result", result.toJSON());
      this.memory.addMessage("agent", result.success ? `Done: ${tool.name}` : `Error: ${result.error?.message}`);

<<<<<<< HEAD
      const success = result.success && (!verification || verification.passed);
      const response = new AgentResponse({
        success, input: sanitized, intent, tool: tool.name, decision,
        output: result.output, error: result.error, verification, steps, repairs,
        duration: Date.now() - start, sessionId,
=======
      const response = new AgentResponse({
        success: result.success, input: sanitized, intent, tool: tool.name,
        output: result.output, error: result.error, duration: Date.now() - start, sessionId,
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
      });
      emit("done", { response });
      return response;

    } catch (err) {
      emit("error", { error: err.message });
<<<<<<< HEAD
      return new AgentResponse({ success: false, input, intent: null, tool: null, decision: null, output: null, error: err, verification: null, steps, repairs: 0, duration: Date.now() - start, sessionId });
=======
      return new AgentResponse({ success: false, input, intent: null, tool: null, output: null, error: err, duration: Date.now() - start, sessionId });
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
    }
  }

  // ── Chainable config ───────────────────────────────────────────────────────
  addTool(tool)   { this.registry.register(tool); return this; }
<<<<<<< HEAD
  addCheck(spec)  { if (!this.verifier) this.verifier = new Verifier(); this.verifier.check(spec); return this; }
=======
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
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
<<<<<<< HEAD
      verifier:   this.verifier ? { checks: this.verifier.size } : null,
=======
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
      history:    this.memory.getHistory(),
    };
  }
}

class AgentResponse {
<<<<<<< HEAD
  constructor({ success, input, intent, tool, decision, output, error, verification, steps, repairs, duration, sessionId }) {
    this.success      = success;
    this.input        = input;
    this.intent       = intent;
    this.tool         = tool;
    this.decision     = decision || null;
    this.output       = output;
    this.error        = error  || null;
    this.verification = verification || null;
    this.steps        = steps   || [];
    this.repairs      = repairs || 0;
    this.duration     = duration;
    this.sessionId    = sessionId;
    this.timestamp    = new Date().toISOString();
  }
  toJSON() {
    return { success: this.success, input: this.input, intent: this.intent, tool: this.tool,
      decision: this.decision, output: this.output,
      error: this.error ? { message: this.error.message, type: this.error.name } : null,
      verification: this.verification ? this.verification.toJSON() : null,
      repairs: this.repairs, duration: this.duration, sessionId: this.sessionId, timestamp: this.timestamp };
=======
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
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
  }
}

module.exports = { createAgent, Agent, AgentResponse };
