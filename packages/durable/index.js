"use strict";

class MemoryCheckpointStore {
  constructor() { this._records = new Map(); }
  async load(runId) { return clone(this._records.get(runId) || null); }
  async save(runId, state) { this._records.set(runId, clone(state)); return state; }
  async delete(runId) { return this._records.delete(runId); }
  async list() { return [...this._records.entries()].map(([runId, state]) => ({ runId, ...clone(state) })); }
}

class FileCheckpointStore {
  constructor(opts = {}) {
    const path = require("path");
    this.path = opts.path || path.join(process.cwd(), ".agent-checkpoints.json");
  }
  _read() { try { return JSON.parse(require("fs").readFileSync(this.path, "utf8")); } catch { return {}; } }
  _write(data) {
    const fs = require("fs"), path = require("path");
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    const temp = this.path + "." + process.pid + "." + Date.now() + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, this.path);
  }
  async load(runId) { return this._read()[runId] || null; }
  async save(runId, state) { const data = this._read(); data[runId] = state; this._write(data); return state; }
  async delete(runId) { const data = this._read(); const found = Object.prototype.hasOwnProperty.call(data, runId); delete data[runId]; this._write(data); return found; }
  async list() { return Object.entries(this._read()).map(([runId, state]) => ({ runId, ...state })); }
}

async function runDurable(workflow, orchestrator, input = {}, opts = {}) {
  if (!workflow?.execute) throw new DurableWorkflowError("runDurable requires a Workflow");
  const store = opts.store || new MemoryCheckpointStore();
  const runId = opts.runId || "run_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const result = await workflow.execute(orchestrator, input, { ...opts, checkpointStore: store, runId, resume: opts.resume !== false });
  result.runId = runId;
  return result;
}

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
class DurableWorkflowError extends Error { constructor(message) { super(message); this.name = "DurableWorkflowError"; } }
module.exports = { MemoryCheckpointStore, FileCheckpointStore, runDurable, DurableWorkflowError };
