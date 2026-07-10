"use strict";

/**
 * @munesoft/agent — Multi-Agent Orchestrator
 * Pipeline, parallel, smart routing, agent handoff.
 */

class Orchestrator {
  constructor(opts = {}) {
    this._agents  = new Map();
    this.debug    = opts.debug    || false;
    this.maxDepth = opts.maxDepth || 5;
    this.timeout  = opts.timeout  || 30000;
  }

  // ── Registration ───────────────────────────────────────────────────────────

  register(name, agent) {
    if (!name || typeof name !== "string")  throw new OrchestratorError("Agent name must be a string");
    if (typeof agent?.run !== "function")   throw new OrchestratorError("Must be a valid agent");
    if (this._agents.has(name))             throw new OrchestratorError(`Agent "${name}" already registered`);
    this._agents.set(name, agent);
    if (this.debug) console.log(`[Orchestrator] + ${name}`);
    return this;
  }

  unregister(name) { this._agents.delete(name); return this; }
  get(name)        { const a = this._agents.get(name); if (!a) throw new OrchestratorError(`Agent "${name}" not found. Known: ${this.list().join(", ")}`); return a; }
  list()           { return [...this._agents.keys()]; }
  has(name)        { return this._agents.has(name); }

  // ── Single run ─────────────────────────────────────────────────────────────

  async run(name, input, context = {}) {
    if (this.debug) console.log(`[Orchestrator] run "${name}": ${input}`);
    return await this.get(name).run(input, { ...context, _orchestrator: this, _depth: context._depth || 0 });
  }

  // ── Sequential Pipeline ────────────────────────────────────────────────────

  /**
   * Run steps in sequence. Each step's result is available to the next via (prevResult, allResults) => input.
   * @param {Array<{agent, input, stopOnError?, label?}>} steps
   */
  async pipeline(steps, context = {}) {
    if (!steps?.length) throw new OrchestratorError("Pipeline needs at least one step");
    const start = Date.now(), results = [];
    let prev = null;

    for (let i = 0; i < steps.length; i++) {
      const step  = steps[i];
      if (!step.agent) throw new OrchestratorError(`Step ${i} missing "agent"`);
      const input = typeof step.input === "function" ? step.input(prev, results) : step.input;
      if (!input) throw new OrchestratorError(`Step ${i} (${step.agent}) has no input`);

      if (this.debug) console.log(`[Pipeline] ${i + 1}/${steps.length} "${step.agent}": ${input}`);
      const result = await this.run(step.agent, input, { ...context, _pipelineStep: i });
      results.push({ step: i, agent: step.agent, input, result, label: step.label || step.agent });
      prev = result;

      if (!result.success && step.stopOnError !== false)
        return new PipelineResult({ steps: results, success: false, duration: Date.now() - start, stoppedAt: i });
    }

    return new PipelineResult({ steps: results, success: true, duration: Date.now() - start, stoppedAt: null });
  }

  // ── Parallel ───────────────────────────────────────────────────────────────

  /**
   * Run multiple agents simultaneously.
   * @param {Array<{agent, input}>} tasks
   */
  async parallel(tasks, context = {}) {
    if (!tasks?.length) throw new OrchestratorError("Parallel needs at least one task");
    if (this.debug) console.log(`[Orchestrator] parallel x${tasks.length}`);
    const start = Date.now();

    const settled = await Promise.all(
      tasks.map(({ agent, input }, i) =>
        this.run(agent, input, { ...context, _parallelIndex: i })
          .then(result => ({ agent, input, result, error: null }))
          .catch(error => ({ agent, input, result: null, error }))
      )
    );

    return new ParallelResult({ tasks: settled, success: settled.every(t => t.result?.success), duration: Date.now() - start });
  }

  // ── Smart Routing ──────────────────────────────────────────────────────────

  /**
   * Route input to the best agent via a selector function.
   * @param {string} input
   * @param {Function} selector - async (input, agentNames) => agentName
   */
  async route(input, selector, context = {}) {
    const chosen = await selector(input, this.list());
    if (!this._agents.has(chosen)) throw new OrchestratorError(`Selector returned unknown agent: "${chosen}"`);
    if (this.debug) console.log(`[Orchestrator] routed → "${chosen}"`);
    return await this.run(chosen, input, context);
  }

  // ── Agent Handoff ──────────────────────────────────────────────────────────

  /**
   * Give agentName a tool to hand tasks off to each target agent.
   * Prevents infinite loops via maxDepth.
   */
  enableHandoff(agentName, targetAgents) {
    const agent = this.get(agentName);
    const orch  = this;
    for (const target of targetAgents) {
      agent.addTool({
        name:        `handoff_to_${target}`,
        description: `Delegate this task to the ${target} agent`,
        schema:      { task: "string" },
        handler: async ({ task }, ctx) => {
          const depth = (ctx._depth || 0) + 1;
          if (depth > orch.maxDepth) throw new Error(`Max handoff depth (${orch.maxDepth}) exceeded`);
          const r = await orch.run(target, task, { ...ctx, _depth: depth });
          return r.output || { delegated: true, agent: target };
        },
        options: { tags: ["handoff"] },
      });
      if (this.debug) console.log(`[Orchestrator] handoff: ${agentName} → ${target}`);
    }
    return this;
  }

  // ── LLM-based routing ─────────────────────────────────────────────────────

  /**
   * Use an LLM to decide which agent should handle the input.
   * @param {string} input
   * @param {object} llm - LLM adapter instance
   * @param {object} agentDescriptions - { agentName: "description", ... }
   */
  async llmRoute(input, llm, agentDescriptions = {}) {
    const agents = Object.entries(agentDescriptions).map(([n, d]) => `- ${n}: ${d}`).join("\n");
    const system = `You are a routing agent. Given the user input and available agents, return ONLY the agent name that best handles the request.
Available agents:\n${agents}`;
    const response = await llm.complete({ system, user: input });
    const chosen   = response.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    if (!this._agents.has(chosen)) throw new OrchestratorError(`LLM routing returned unknown agent: "${chosen}"`);
    return await this.run(chosen, input);
  }
}

// ── Results ───────────────────────────────────────────────────────────────────

class PipelineResult {
  constructor({ steps, success, duration, stoppedAt }) {
    this.steps       = steps;
    this.success     = success;
    this.duration    = duration;
    this.stoppedAt   = stoppedAt;
    this.finalOutput = steps.at(-1)?.result?.output || null;
    this.timestamp   = new Date().toISOString();
  }
  toJSON() {
    return { success: this.success, duration: this.duration, stoppedAt: this.stoppedAt, finalOutput: this.finalOutput,
      steps: this.steps.map(s => ({ step: s.step, agent: s.agent, label: s.label, success: s.result?.success, output: s.result?.output })) };
  }
}

class ParallelResult {
  constructor({ tasks, success, duration }) {
    this.tasks     = tasks;
    this.success   = success;
    this.duration  = duration;
    this.outputs   = tasks.map(t => ({ agent: t.agent, output: t.result?.output, success: t.result?.success, error: t.error?.message || null }));
    this.timestamp = new Date().toISOString();
  }
  toJSON() { return { success: this.success, duration: this.duration, outputs: this.outputs }; }
}

class OrchestratorError extends Error { constructor(m) { super(m); this.name = "OrchestratorError"; } }

module.exports = { Orchestrator, PipelineResult, ParallelResult, OrchestratorError };
