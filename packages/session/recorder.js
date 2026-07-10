"use strict";

/**
 * @munesoft/agent — Session Recorder
 *
 * Turns the events your Agent already emits into searchable SessionStore records —
 * without touching core. It listens on the agent's EventBus, accumulates per-session
 * state, and flushes one episode when a run finishes.
 *
 * Events consumed: agent.run, intent.parsed, tool.selected, tool.executed,
 *                  memory.updated, agent.error.
 */

/**
 * @param {object} agent   an Agent (must expose `.events` EventBus)
 * @param {SessionStore} store
 * @param {object} [opts]
 * @param {(ctx)=>string[]} [opts.extractFiles]  derive filesTouched from a run's tool outputs
 * @param {(ctx)=>string[]} [opts.extractDecisions]
 * @returns {Function} detach()
 */
function attachRecorder(agent, store, opts = {}) {
  if (!agent?.events?.on) throw new Error("attachRecorder: agent has no event bus");
  const bus      = agent.events;
  const sessions = new Map(); // sessionId -> accumulator

  const acc = (sid) => {
    if (!sessions.has(sid))
      sessions.set(sid, { sessionId: sid, task: "", intent: null, toolsUsed: [], filesTouched: [], decisions: [], events: [], outcome: "", agent: opts.agentName || "agent" });
    return sessions.get(sid);
  };

  const unsubs = [
    bus.on("agent.run", (p) => { const a = acc(p.sessionId); a.task = p.input || a.task; a.events.push({ t: "run", input: p.input }); }),
    bus.on("intent.parsed", (p) => { const a = acc(p.sessionId); a.intent = p.intent; a.events.push({ t: "intent", intent: p.intent }); }),
    bus.on("tool.selected", (p) => { const a = acc(p.sessionId); if (p.tool) a.toolsUsed.push(p.tool); a.events.push({ t: "tool", tool: p.tool, args: p.args }); }),
    bus.on("tool.executed", (p) => {
      const a = acc(p.sessionId);
      a.outcome = p.success ? "success" : "error";
      a.events.push({ t: "exec", tool: p.tool, success: p.success });
    }),
    bus.on("agent.error", (p) => { const a = acc(p.sessionId); a.outcome = "error"; a.decisions.push(`error: ${p.error}`); }),
  ];

  // Flush at end of run. The bus emits "memory.updated" once per completed run,
  // and "agent.error" on failure — both are terminal signals we can flush on.
  const flush = (sid) => {
    const a = sessions.get(sid);
    if (!a) return;
    sessions.delete(sid);

    if (opts.extractFiles)     a.filesTouched = dedupe([...a.filesTouched, ...(opts.extractFiles(a) || [])]);
    if (opts.extractDecisions) a.decisions    = [...a.decisions, ...(opts.extractDecisions(a) || [])];

    a.toolsUsed = dedupe(a.toolsUsed);
    a.summary   = a.summary || autoSummary(a);
    store.record(a);
  };

  unsubs.push(bus.on("memory.updated", (p) => flush(p.sessionId)));
  unsubs.push(bus.on("agent.error",    (p) => flush(p.sessionId)));

  return () => unsubs.forEach(u => u());
}

/**
 * Record a run manually (e.g. for coding-agent style flows where you track files
 * yourself). Returns the stored record.
 */
function recordRun(store, run) {
  return store.record(run);
}

function autoSummary(a) {
  const tools = a.toolsUsed.length ? ` via ${a.toolsUsed.join(", ")}` : "";
  const files = a.filesTouched.length ? ` touched ${a.filesTouched.length} file(s)` : "";
  return `${a.outcome || "ran"}: "${(a.task || "").slice(0, 80)}"${tools}${files}`.trim();
}

function dedupe(arr) { return [...new Set(arr)]; }

module.exports = { attachRecorder, recordRun };
