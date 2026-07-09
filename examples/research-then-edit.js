"use strict";
/**
 * Search-before-work: a history-research subagent reports on prior sessions, then
 * editors run file-safely (overlapping files are serialized).
 * Run: node examples/research-then-edit.js
 */
const { createAgent, Orchestrator, SessionStore, createHistoryResearchAgent, researchThenEdit } = require("../index");

const store = new SessionStore({ path: null });
store.record({ task: "add retry to payment client", filesTouched: ["src/payments/client.ts"], decisions: ["chose exponential backoff"], outcome: "success" });
store.record({ task: "migration failed on orders", filesTouched: ["migrations/003.sql"], decisions: ["had to rollback; cursor name mismatch"], outcome: "error" });

const orch = new Orchestrator();
const editor = (name) => createAgent({
  name, tools: [{ name: "edit", description: "edit a file", schema: {}, handler: async (_a, ctx) => ({ editedBy: name, sawPriorContext: !!ctx.priorContext }) }],
  rules: [{ pattern: /.*/, action: "edit", extract: () => ({}) }], guardrails: false,
});
orch.register("editor-a", editor("editor-a"));
orch.register("editor-b", editor("editor-b"));

const researcher = createHistoryResearchAgent({ store });

(async () => {
  const { report, execution } = await researchThenEdit({
    orchestrator: orch, researcher,
    task: "harden payment retries",
    editors: [
      { agent: "editor-a", input: (rep) => `context: ${rep.relatedSessions.length} prior sessions`, files: ["src/payments/client.ts"] },
      { agent: "editor-b", input: "update backoff", files: ["src/util/backoff.ts"] },
    ],
  });
  console.log("RESEARCH BRIEF\n", report.brief, "\n");
  console.log("EXECUTION");
  for (const o of execution.outputs) console.log(`  ${o.agent}: success=${o.success}`, o.output);
})();
