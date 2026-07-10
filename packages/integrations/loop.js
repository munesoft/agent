"use strict";

/**
 * @munesoft/loopx integration — drive multi-step AI loops.
 * Iterate an agent (re-running with evolving input) until a stop condition, a max
 * iteration cap, or a timeout — with loopx handling stagnation/abort/observability.
 */
const { requireDep, primary } = require("./_load");

function _loopx() { return primary(requireDep("@munesoft/loopx", "runAgentLoop"), "loopx"); }

/**
 * Run an agent in a loop.
 * @param {object} agent  a Munesoft Agent (has .run())
 * @param {string} input  the first input
 * @param {object} [opts]
 *   @param {number}   [opts.maxIterations=5]
 *   @param {(res, step)=>boolean|Promise<boolean>} [opts.until]  stop when truthy (default: res.success)
 *   @param {(step, responses)=>string} [opts.next]  compute the next input (default: previous input)
 *   plus any loopx options (timeout, stop, hooks…)
 * @returns {Promise<{ result:object, responses:object[], final:object|null }>}
 */
async function runAgentLoop(agent, input, opts = {}) {
  const loopx = _loopx();
  const { maxIterations = 5, until, next, sessionId, ...loopOpts } = opts;
  const responses = [];

  const result = await loopx(async (step) => {
    if (!step.state.sessionId) step.state.sessionId = sessionId || `loop_${Date.now()}`;
    const runInput = typeof next === "function" ? next(step, responses) : (step.data ?? input);
    const res = await agent.run(runInput, { sessionId: step.state.sessionId });
    responses.push(res);
    step.state.last = res;

    const done = until ? await until(res, step) : res.success;
    if (done) step.stop("completed");
    else step.next(runInput);
  }, { maxIterations, ...loopOpts });

  return { result, responses, final: responses[responses.length - 1] || null };
}

module.exports = { runAgentLoop };
