"use strict";

/**
 * @munesoft/asyncx integration — concurrency limits for background jobs.
 * Run many orchestrator tasks with a bounded concurrency (plus asyncx retry/timeout),
 * instead of Orchestrator.parallel()'s unbounded Promise.all.
 * (asyncx ships an ESM build, so this adapter is async and lazy-imports it.)
 */
const { importDep, primary } = require("./_load");

/**
 * Concurrency-limited parallel run over an Orchestrator.
 * @param {object} orch   an Orchestrator (has .run(agent, input, ctx))
 * @param {Array<{agent:string,input:any,files?:string[]}>} tasks
 * @param {object} [opts]
 *   @param {number} [opts.concurrency=4]
 *   @param {object} [opts.context]
 *   plus any asyncx options (retry, timeout, backoff, delay…)
 * @returns {Promise<{ success:boolean, outputs:object[], raw:object[] }>}
 */
async function boundedParallel(orch, tasks, opts = {}) {
  const asyncx = primary(await importDep("@munesoft/asyncx", "boundedParallel"), "asyncx");
  const { concurrency = 4, context = {}, ...axOpts } = opts;

  const jobs = tasks.map((t) => (signal) =>
    orch.run(t.agent, t.input, { ...context, signal, _files: t.files || [] }));

  const results = await asyncx.map(jobs, { concurrency, ...axOpts });

  return {
    success: results.every((r) => r && r.success),
    outputs: results.map((r, i) => ({
      agent:   tasks[i].agent,
      success: (r && r.success) || false,
      output:  r && r.output,
    })),
    raw: results,
  };
}

module.exports = { boundedParallel };
