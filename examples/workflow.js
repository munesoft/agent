"use strict";
const { createAgent, Orchestrator, WorkflowBuilder } = require("../index");

function makeAgent(toolName, fn) {
  return createAgent({
    tools: [{ name: toolName, description: toolName, schema: { input: { type: "string", required: false, default: "" } }, handler: fn }],
    rules: [{ pattern: /.+/, action: toolName, extract: m => ({ input: m[0] }), confidence: 0.9 }],
  });
}

const orch = new Orchestrator();
orch.register("triage",  makeAgent("triage_issue",   async ({ input }) => ({ priority: input.toLowerCase().includes("urgent") || input.toLowerCase().includes("down") ? "high" : "normal", ticketId: `TKT-${Date.now().toString().slice(-4)}`, issue: input })));
orch.register("urgent",  makeAgent("escalate",        async ({ input }) => { console.log(`  🚨 Escalated: ${input}`); return { escalated: true, assignedTo: "senior-team" }; }));
orch.register("normal",  makeAgent("queue",           async ({ input }) => { console.log(`  📋 Queued: ${input}`);    return { queued: true, estimatedWait: "2 hours" }; }));
orch.register("notify",  makeAgent("notify_customer", async ({ input }) => { console.log(`  📩 Notified: ${input}`); return { notified: true }; }));

const workflow = new WorkflowBuilder({ name: "Support Ticket Flow", description: "Triage → route → notify" })
  .start("start")
  .agent("triage",     { agent: "triage", input: ctx => ctx.issue || "unknown issue" })
  .condition("check",  { condition: ctx => ctx.triage_output?.priority === "high", onTrue: "escalate", onFalse: "queue" })
  .agent("escalate",   { agent: "urgent", input: ctx => `${ctx.triage_output?.ticketId}` })
  .agent("queue",      { agent: "normal", input: ctx => `${ctx.triage_output?.ticketId}` })
  .transform("enrich", ctx => ({ ...ctx, enriched: true, processedAt: new Date().toISOString() }))
  .agent("notify",     { agent: "notify", input: ctx => `${ctx.triage_output?.ticketId}` })
  .log("audit",        ctx => `Completed ticket ${ctx.triage_output?.ticketId} [${ctx.triage_output?.priority}]`)
  .end("end")
  .connect("start",    "triage")
  .connect("triage",   "check")
  .connect("escalate", "enrich")
  .connect("queue",    "enrich")
  .connect("enrich",   "notify")
  .connect("notify",   "audit")
  .connect("audit",    "end")
  .build();

async function run() {
  console.log("\n🔧 Workflow Builder Demo\n" + "=".repeat(48));

  console.log("\n📊 Diagram:");
  console.log(workflow.diagram());

  const json = workflow.toJSON();
  console.log(`\n📦 JSON: ${json.nodes.length} nodes, ${json.edges.length} edges`);
  console.log(`   Types: ${[...new Set(json.nodes.map(n => n.type))].join(", ")}`);

  console.log("\n▶ Normal ticket:");
  const r1 = await workflow.execute(orch, { issue: "login page is slow" });
  console.log(`  ✓ ${r1.duration}ms | ${r1.log.length} steps | priority: ${r1.context.triage_output?.priority} | enriched: ${r1.context.enriched}`);

  console.log("\n▶ Urgent ticket:");
  const r2 = await workflow.execute(orch, { issue: "production server is down URGENT" });
  console.log(`  ✓ ${r2.duration}ms | ${r2.log.length} steps | priority: ${r2.context.triage_output?.priority}`);

  console.log("\n" + "=".repeat(48) + "\n✅ Done\n");
}
run().catch(console.error);
