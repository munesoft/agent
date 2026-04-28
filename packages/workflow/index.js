"use strict";

/**
 * @munesoft/agent — Visual Workflow Builder
 * Build agent workflows as directed graphs.
 * Nodes: start, end, agent, condition, transform, parallel, delay, log, retry, input.
 * Export to JSON for visual editors. Import from JSON.
 */

const NODE_TYPES = {
  START:     "start",
  END:       "end",
  AGENT:     "agent",
  CONDITION: "condition",
  TRANSFORM: "transform",
  PARALLEL:  "parallel",
  DELAY:     "delay",
  LOG:       "log",
  RETRY:     "retry",
};

// ── Builder ───────────────────────────────────────────────────────────────────

class WorkflowBuilder {
  constructor(opts = {}) {
    this.name        = opts.name        || "Unnamed Workflow";
    this.description = opts.description || "";
    this._nodes      = new Map();
    this._edges      = [];
    this._startId    = null;
    this.debug       = opts.debug || false;
  }

  // ── Node methods ─────────────────────────────────────────────────────────

  start(id = "start")  { return this._add(id, NODE_TYPES.START,     { label: "Start" }); }
  end(id = "end")      { return this._add(id, NODE_TYPES.END,       { label: "End" }); }

  /** Run a registered agent. config.input can be a string or (ctx) => string */
  agent(id, config)    {
    if (!config?.agent) throw new WorkflowError(`Node "${id}": agent name required`);
    return this._add(id, NODE_TYPES.AGENT, { label: config.label || id, ...config });
  }

  /** Branch workflow. config.condition = (ctx) => boolean, config.onTrue, config.onFalse */
  condition(id, config) {
    if (typeof config?.condition !== "function") throw new WorkflowError(`Node "${id}": condition must be a function`);
    return this._add(id, NODE_TYPES.CONDITION, config);
  }

  /** Transform context without calling an agent. fn = (ctx) => updatedCtx */
  transform(id, fn) {
    if (typeof fn !== "function") throw new WorkflowError(`Node "${id}": transform must be a function`);
    return this._add(id, NODE_TYPES.TRANSFORM, { transform: fn, label: id });
  }

  /** Run multiple agent branches simultaneously */
  parallel(id, branches) {
    if (!Array.isArray(branches) || branches.length < 2) throw new WorkflowError(`Node "${id}": parallel needs 2+ branches`);
    return this._add(id, NODE_TYPES.PARALLEL, { branches, label: `Parallel×${branches.length}` });
  }

  /** Pause execution */
  delay(id, ms) { return this._add(id, NODE_TYPES.DELAY, { ms, label: `Wait ${ms}ms` }); }

  /** Log context to console */
  log(id, message) { return this._add(id, NODE_TYPES.LOG, { message, label: `Log` }); }

  /** Retry a node up to N times on failure */
  retry(id, config) {
    if (!config?.targetNode) throw new WorkflowError(`Node "${id}": targetNode required`);
    return this._add(id, NODE_TYPES.RETRY, { maxRetries: config.maxRetries || 3, targetNode: config.targetNode, label: `Retry×${config.maxRetries || 3}` });
  }

  // ── Edges ─────────────────────────────────────────────────────────────────

  connect(from, to, label = "") {
    if (!this._nodes.has(from)) throw new WorkflowError(`connect: node "${from}" not found`);
    if (!this._nodes.has(to))   throw new WorkflowError(`connect: node "${to}" not found`);
    this._edges.push({ from, to, label });
    return this;
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  build() {
    this._validate();
    return new Workflow({ name: this.name, description: this.description, nodes: new Map(this._nodes), edges: [...this._edges], startId: this._startId, debug: this.debug });
  }

  toJSON() {
    return { name: this.name, description: this.description,
      nodes: Array.from(this._nodes.values()).map(n => ({
        ...n,
        condition: undefined, transform: undefined, // functions can't be serialised
      })),
      edges: this._edges };
  }

  static fromJSON(json) {
    const b = new WorkflowBuilder({ name: json.name, description: json.description });
    for (const node of json.nodes) {
      b._nodes.set(node.id, node);
      if (node.type === NODE_TYPES.START) b._startId = node.id;
    }
    b._edges = json.edges || [];
    return b;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  _add(id, type, config) {
    if (this._nodes.has(id)) throw new WorkflowError(`Node "${id}" already exists`);
    this._nodes.set(id, { id, type, ...config });
    if (type === NODE_TYPES.START) {
      if (this._startId) throw new WorkflowError("Workflow can only have one start node");
      this._startId = id;
    }
    return this;
  }

  _validate() {
    if (!this._startId) throw new WorkflowError("Missing start node — call .start()");
    if (this._nodes.size < 2) throw new WorkflowError("Need at least 2 nodes");
    const endNodes = [...this._nodes.values()].filter(n => n.type === NODE_TYPES.END);
    if (!endNodes.length) throw new WorkflowError("Missing end node — call .end()");
    for (const [id, node] of this._nodes) {
      if (node.type === NODE_TYPES.END || node.type === NODE_TYPES.CONDITION) continue;
      if (!this._edges.some(e => e.from === id))
        throw new WorkflowError(`Node "${id}" has no outgoing edge`);
    }
  }
}

// ── Executor ──────────────────────────────────────────────────────────────────

class Workflow {
  constructor({ name, description, nodes, edges, startId, debug }) {
    this.name        = name;
    this.description = description;
    this._nodes      = nodes;
    this._edges      = edges;
    this._startId    = startId;
    this.debug       = debug;
  }

  async execute(orchestrator, initialContext = {}) {
    const start   = Date.now();
    const log     = [];
    let   ctx     = { ...initialContext, _workflow: this.name };
    let   current = this._startId;
    let   steps   = 0;
    const MAX     = 100;

    while (current && steps++ < MAX) {
      const node = this._nodes.get(current);
      if (!node) throw new WorkflowError(`Node "${current}" not found`);
      if (this.debug) console.log(`[Workflow] ${steps}: [${node.type}] ${current}`);

      const t0 = Date.now();

      try {
        switch (node.type) {

          case NODE_TYPES.START:
            log.push({ id: current, type: node.type, output: null, duration: 0 });
            break;

          case NODE_TYPES.END:
            log.push({ id: current, type: node.type, output: null, duration: 0 });
            return new WorkflowResult({ success: true, ctx, log, duration: Date.now() - start, finalNode: current });

          case NODE_TYPES.AGENT: {
            const input  = typeof node.input === "function" ? node.input(ctx) : node.input;
            const result = await orchestrator.run(node.agent, input, ctx);
            const out    = result.output;
            ctx = { ...ctx, [`${current}_output`]: out, _lastOutput: out, _lastSuccess: result.success };
            log.push({ id: current, type: node.type, output: out, duration: Date.now() - t0 });
            if (!result.success && node.stopOnError !== false)
              return new WorkflowResult({ success: false, ctx, log, duration: Date.now() - start, error: result.error, finalNode: current });
            break;
          }

          case NODE_TYPES.CONDITION: {
            const branch = await node.condition(ctx);
            const next   = branch ? node.onTrue : node.onFalse;
            log.push({ id: current, type: node.type, output: { branch, next }, duration: Date.now() - t0 });
            current = next; continue;
          }

          case NODE_TYPES.TRANSFORM: {
            const updated = await node.transform(ctx);
            ctx = { ...ctx, ...updated };
            log.push({ id: current, type: node.type, output: updated, duration: Date.now() - t0 });
            break;
          }

          case NODE_TYPES.PARALLEL: {
            const tasks = node.branches.map(b => ({
              agent: b.agent,
              input: typeof b.input === "function" ? b.input(ctx) : b.input,
            }));
            const pr  = await orchestrator.parallel(tasks, ctx);
            ctx = { ...ctx, [`${current}_output`]: pr.outputs, _lastOutput: pr.outputs };
            log.push({ id: current, type: node.type, output: pr.outputs, duration: Date.now() - t0 });
            break;
          }

          case NODE_TYPES.DELAY:
            await new Promise(r => setTimeout(r, node.ms));
            log.push({ id: current, type: node.type, output: { delayed: node.ms }, duration: node.ms });
            break;

          case NODE_TYPES.LOG: {
            const msg = typeof node.message === "function" ? node.message(ctx) : node.message;
            console.log(`[Workflow:${this.name}] ${msg}`);
            log.push({ id: current, type: node.type, output: { msg }, duration: Date.now() - t0 });
            break;
          }

          default:
            log.push({ id: current, type: node.type, output: null, duration: 0 });
        }

        // Follow next edge
        const edge = this._edges.find(e => e.from === current);
        current    = edge ? edge.to : null;

      } catch (err) {
        log.push({ id: current, type: node.type, error: err.message, duration: Date.now() - t0 });
        return new WorkflowResult({ success: false, ctx, log, duration: Date.now() - start, error: err, finalNode: current });
      }
    }

    if (steps >= MAX)
      return new WorkflowResult({ success: false, ctx, log, duration: Date.now() - start, error: new Error("Max steps exceeded — possible loop") });

    return new WorkflowResult({ success: true, ctx, log, duration: Date.now() - start });
  }

  toJSON() {
    return { name: this.name, description: this.description,
      nodes: Array.from(this._nodes.values()), edges: this._edges };
  }

  /** Print a text-based diagram of the workflow */
  diagram() {
    const lines   = [`Workflow: ${this.name}`, ""];
    const visited = new Set();
    const queue   = [this._startId];
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const node    = this._nodes.get(id);
      if (!node) continue;
      const targets = this._edges.filter(e => e.from === id).map(e => e.to);
      lines.push(`  [${node.type.toUpperCase().padEnd(9)}] ${id}${targets.length ? ` → ${targets.join(", ")}` : ""}`);
      targets.forEach(t => queue.push(t));
      // Condition branches
      if (node.type === NODE_TYPES.CONDITION) {
        if (node.onTrue)  { lines.push(`    ├─ true  → ${node.onTrue}`);  queue.push(node.onTrue); }
        if (node.onFalse) { lines.push(`    └─ false → ${node.onFalse}`); queue.push(node.onFalse); }
      }
    }
    return lines.join("\n");
  }
}

// ── Result ────────────────────────────────────────────────────────────────────

class WorkflowResult {
  constructor({ success, ctx, log, duration, error, finalNode }) {
    this.success   = success;
    this.context   = ctx;
    this.log       = log;
    this.duration  = duration;
    this.error     = error     || null;
    this.finalNode = finalNode || null;
    this.timestamp = new Date().toISOString();
  }
  toJSON() {
    return { success: this.success, finalNode: this.finalNode, duration: this.duration,
      steps: this.log.length, error: this.error ? { message: this.error.message } : null, context: this.context };
  }
}

class WorkflowError extends Error { constructor(m) { super(m); this.name = "WorkflowError"; } }

module.exports = { WorkflowBuilder, Workflow, WorkflowResult, WorkflowError, NODE_TYPES };
