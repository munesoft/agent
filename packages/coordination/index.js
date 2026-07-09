"use strict";

/**
 * @munesoft/agent — File Coordination for parallel agents
 *
 * The reviewer's core warning: "be careful about multiple agents editing the same
 * files at once." Your Orchestrator.parallel() runs tasks with Promise.all and has no
 * notion of who's touching what. FileCoordinator adds advisory file claims so
 * overlapping edits are either rejected or serialized — and researchThenEdit() wires
 * the "history-research subagent runs first, then editors run" pattern.
 */

class FileCoordinator {
  constructor(opts = {}) {
    this._claims = new Map(); // normalized file -> owner
    this.debug   = opts.debug || false;
  }

  _norm(f) { return String(f).replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase(); }

  /** Try to claim files for an owner. Returns { ok, conflicts:[{file,owner}] }. */
  acquire(owner, files = []) {
    const conflicts = [];
    for (const f of files) {
      const key = this._norm(f);
      const held = this._claims.get(key);
      if (held && held !== owner) conflicts.push({ file: f, owner: held });
    }
    if (conflicts.length) return { ok: false, conflicts };
    for (const f of files) this._claims.set(this._norm(f), owner);
    if (this.debug) console.log(`[Coord] ${owner} claimed ${files.length} file(s)`);
    return { ok: true, conflicts: [] };
  }

  release(owner) {
    for (const [k, v] of [...this._claims]) if (v === owner) this._claims.delete(k);
    return this;
  }

  whoHas(file) { return this._claims.get(this._norm(file)) || null; }
  active()     { return [...new Set(this._claims.values())]; }
}

class FileConflictError extends Error {
  constructor(conflicts) {
    super(`File conflict: ${conflicts.map(c => `${c.file} (held by ${c.owner})`).join(", ")}`);
    this.name = "FileConflictError";
    this.conflicts = conflicts;
  }
}

/**
 * File-safe parallel run over an Orchestrator.
 * Each task declares the files it intends to touch: { agent, input, files:[...] }.
 *  - onConflict "reject"    (default): conflicting tasks fail fast with FileConflictError
 *  - onConflict "serialize": conflicting tasks run sequentially after the holder releases
 *
 * @param {Orchestrator} orch
 * @param {Array<{agent,input,files?:string[]}>} tasks
 * @param {object} [opts] { coordinator, onConflict, context }
 */
async function safeParallel(orch, tasks, opts = {}) {
  const coord      = opts.coordinator || new FileCoordinator({ debug: opts.debug });
  const onConflict = opts.onConflict || "reject";
  const context    = opts.context || {};
  const start      = Date.now();

  // Partition into a first wave with no overlap, and a deferred wave.
  const wave = [];
  const deferred = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const owner = `${t.agent}#${i}`;
    const claim = coord.acquire(owner, t.files || []);
    if (claim.ok) wave.push({ t, owner });
    else if (onConflict === "serialize") deferred.push({ t, owner, conflicts: claim.conflicts });
    else deferred.push({ t, owner, conflicts: claim.conflicts, reject: true });
  }

  const runOne = async ({ t, owner }) => {
    try {
      const result = await orch.run(t.agent, t.input, { ...context, _owner: owner, _files: t.files || [] });
      return { agent: t.agent, input: t.input, files: t.files || [], result, error: null };
    } catch (error) {
      return { agent: t.agent, input: t.input, files: t.files || [], result: null, error };
    } finally {
      coord.release(owner);
    }
  };

  const results = await Promise.all(wave.map(runOne));

  // Handle deferred tasks.
  for (const d of deferred) {
    if (d.reject) {
      results.push({ agent: d.t.agent, input: d.t.input, files: d.t.files || [], result: null, error: new FileConflictError(d.conflicts) });
      continue;
    }
    // serialize: claim now that holders have released, then run
    const claim = coord.acquire(d.owner, d.t.files || []);
    if (!claim.ok) { results.push({ agent: d.t.agent, input: d.t.input, files: d.t.files || [], result: null, error: new FileConflictError(claim.conflicts) }); continue; }
    results.push(await runOne(d));
  }

  return {
    success:  results.every(r => r.result?.success),
    duration: Date.now() - start,
    outputs:  results.map(r => ({ agent: r.agent, files: r.files, success: r.result?.success ?? false, output: r.result?.output, error: r.error?.message || null })),
    raw: results,
  };
}

/**
 * The pattern the reviewer described: a history-research subagent makes a short report
 * on related prior sessions, THEN editor agents run (file-safe) with that report injected
 * into their context.
 *
 * @param {object} cfg
 * @param {Orchestrator} cfg.orchestrator
 * @param {{research:Function}} cfg.researcher   from createHistoryResearchAgent()
 * @param {string} cfg.task
 * @param {Array<{agent,input,files?:string[]}>} cfg.editors
 * @param {object} [cfg.coordinator]
 * @param {"reject"|"serialize"} [cfg.onConflict]
 */
async function researchThenEdit(cfg) {
  const files = [...new Set((cfg.editors || []).flatMap(e => e.files || []))];
  const report = await cfg.researcher.research(cfg.task, files);

  const editors = (cfg.editors || []).map(e => ({
    ...e,
    input: typeof e.input === "function" ? e.input(report) : e.input,
  }));

  const result = await safeParallel(cfg.orchestrator, editors, {
    coordinator: cfg.coordinator,
    onConflict:  cfg.onConflict || "reject",
    context:     { priorContext: report.brief, priorSessions: report.relatedSessions },
  });

  return { report, execution: result };
}

module.exports = { FileCoordinator, FileConflictError, safeParallel, researchThenEdit };
