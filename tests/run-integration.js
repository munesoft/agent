"use strict";
// End-to-end: orchestrator pipeline + parallel + workflow across real agents.
const assert = require("assert");
const { createAgent, Orchestrator, WorkflowBuilder } = require("../index");

let pass = 0, fail = 0;
const t = async (n, fn) => { try { await fn(); pass++; console.log(`  ✓ ${n}`); } catch (e) { fail++; console.log(`  ✗ ${n}\n      ${e.message}`); } };

const mk = (name, out) => createAgent({
  name, guardrails: false,
  tools: [{ name: "do", description: "do work", schema: {}, handler: async () => out }],
  rules: [{ pattern: /.*/, action: "do", extract: () => ({}) }],
});

(async () => {
  console.log("\n── Orchestrator pipeline ──");
  const orch = new Orchestrator();
  orch.register("extract", mk("extract", { text: "raw" }));
  orch.register("summarize", mk("summarize", { summary: "done" }));
  await t("pipeline chains agents", async () => {
    const r = await orch.pipeline([
      { agent: "extract", input: "go" },
      { agent: "summarize", input: (prev) => `summarize ${JSON.stringify(prev.output)}` },
    ]);
    assert.ok(r.success);
    assert.deepEqual(r.finalOutput, { summary: "done" });
  });

  console.log("\n── Parallel ──");
  await t("parallel runs all", async () => {
    const r = await orch.parallel([{ agent: "extract", input: "a" }, { agent: "summarize", input: "b" }]);
    assert.ok(r.success); assert.equal(r.outputs.length, 2);
  });

  console.log("\n── Workflow builder ──");
  await t("builds + validates a graph", async () => {
    const wf = new WorkflowBuilder({ name: "demo" })
      .start().agent("a", { agent: "extract", input: "go" }).end();
    wf.connect("start", "a").connect("a", "end");
    const built = wf.build();
    assert.ok(built);
    const json = built.toJSON();
    assert.equal(json.name, "demo");
  });

  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
