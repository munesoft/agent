"use strict";
const { createAgent, Orchestrator } = require("../index");

function makeAgent(toolName, fn) {
  return createAgent({
    tools: [{ name: toolName, description: toolName, schema: { input: { type: "string", required: false, default: "" } }, handler: fn }],
    rules: [{ pattern: /.+/, action: toolName, extract: m => ({ input: m[0] }), confidence: 0.9 }],
  });
}

const researchAgent = makeAgent("research_topic", async ({ input }) => ({
  topic: input, findings: [`${input} grew 40% YoY`, "Key players: Alpha, Beta, Gamma", "Trend: AI-driven automation"], sources: 12,
}));

const summaryAgent = makeAgent("summarize", async ({ input }) => ({
  summary: `Executive Summary: ${String(input).slice(0, 100)}...`, wordCount: 80,
}));

const emailAgent = makeAgent("send_email", async ({ input }) => {
  console.log(`  📧 Email → ${input}`);
  return { messageId: `msg_${Date.now()}`, status: "sent" };
});

const analystAgent = makeAgent("analyze_market", async ({ input }) => ({
  sector: input, sentiment: "bullish", riskScore: 3.2, recommendation: "buy",
}));

const orch = new Orchestrator({ debug: false });
orch.register("research", researchAgent)
    .register("summary",  summaryAgent)
    .register("email",    emailAgent)
    .register("analyst",  analystAgent);

// Handoff: research can delegate to analyst
orch.enableHandoff("research", ["analyst"]);

async function run() {
  console.log("\n🤖 Multi-Agent Orchestration Demo\n" + "=".repeat(48));

  // 1. Sequential Pipeline
  console.log("\n📋 Pipeline: research → summarize → email");
  const pipeline = await orch.pipeline([
    { agent: "research", input: "research AI automation trends", label: "Research" },
    { agent: "summary",  input: (prev) => `summarize ${JSON.stringify(prev.output?.findings?.join(". "))}`, label: "Summarize" },
    { agent: "email",    input: () => "ceo@company.com", label: "Email" },
  ]);
  console.log(`  ✓ ${pipeline.steps.length} steps in ${pipeline.duration}ms`);
  pipeline.steps.forEach(s => console.log(`    [${s.step+1}] ${s.label}: ${s.result?.success ? "✓" : "✗"}`));

  // 2. Parallel
  console.log("\n⚡ Parallel: 3 sector analysts");
  const parallel = await orch.parallel([
    { agent: "analyst", input: "fintech" },
    { agent: "analyst", input: "healthtech" },
    { agent: "analyst", input: "cleantech" },
  ]);
  console.log(`  ✓ ${parallel.outputs.length} results in ${parallel.duration}ms`);
  parallel.outputs.forEach(o => console.log(`    ${o.output?.sector}: ${o.output?.recommendation} (risk ${o.output?.riskScore})`));

  // 3. Smart routing
  console.log("\n🔀 Smart Routing");
  const routed = await orch.route(
    "analyze cloud computing sector",
    (input) => input.includes("analyze") ? "analyst" : "research"
  );
  console.log(`  ✓ → analyst: ${routed.output?.sector} / ${routed.output?.recommendation}`);

  // 4. LLM routing (mock)
  console.log("\n🧠 LLM-based Routing (mock)");
  const mockLLM = { complete: async () => "analyst" };
  const llmRouted = await orch.llmRoute("what sectors look promising?", mockLLM, {
    research: "Research topics and find information",
    analyst:  "Analyze market sectors and provide recommendations",
    email:    "Send emails and notifications",
  });
  console.log(`  ✓ LLM routed → analyst: ${llmRouted.output?.recommendation}`);

  console.log("\n" + "=".repeat(48) + "\n✅ Done\n");
}
run().catch(console.error);
