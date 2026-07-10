"use strict";
/**
 * Munesoft-stack showcase: one agent wired to the whole stack via the opt-in
 * integration layer. Requires the optional peers:
 *   npm install @munesoft/envx @munesoft/logx @munesoft/retryx @munesoft/asyncx \
 *               @munesoft/idx @munesoft/objx @munesoft/api-normalizer \
 *               @munesoft/memoryx @munesoft/loopx
 * Run: node examples/stack-agent.js
 */
const { createAgent, Orchestrator } = require("../index");
const stack = require("../packages/integrations");

(async () => {
  const missing = Object.entries(stack.stackStatus()).filter(([, s]) => !s.installed).map(([p]) => p);
  if (missing.length) {
    console.log("This example needs the munesoft stack. Missing:\n  " + missing.join("\n  "));
    console.log("\nInstall them and re-run. Skipping.");
    return;
  }

  // 1. envx — validate config up front (nothing required here, just demo defaults)
  const cfg = await stack.loadAgentEnv({ AGENT_MAX_RETRIES: { type: "number", default: 3 } });

  // 2. objx — merge user settings over defaults, safely
  const settings = stack.mergeSettings({ retries: cfg.AGENT_MAX_RETRIES, mode: "prod" }, { mode: "demo" });

  // 3. idx — stable session ids
  const ids = stack.idFactory({ prefix: "sess" });

  // 4. retryx + api-normalizer — a resilient, self-normalizing tool
  let flaky = 0;
  const priceTool = stack.retryableTool(
    stack.normalizingTool(
      {
        name: "get_quote",
        description: "fetch a price quote for a customer",
        schema: { customer: "string" },
        handler: async ({ customer }) => {
          if (++flaky < 2) throw new Error("upstream 503");        // retryx handles this
          return { Customer: customer, PriceUSD: "199.99" };        // messy shape
        },
      },
      { customer: ["Customer"], amount: { keys: ["PriceUSD"], type: "number" } }, // api-normalizer cleans it
      { coerceTypes: true }),
    { retries: settings.retries, delay: 20 });

  const agent = createAgent({
    name: "quote-agent",
    tools: [priceTool],
    rules: [{ pattern: /quote|price/i, action: "get_quote", extract: (m, input) => ({ customer: input.match(/for (\w+)/)?.[1] || "Acme" }) }],
    guardrails: { redactSecrets: true },
  });

  // 5. logx — structured logs for every lifecycle event
  const detachLogs = await stack.attachLogx(agent, { prefix: "quote" });

  // 6. memoryx — record the run into searchable episodic memory
  const memory = stack.createMemoryxStore({ namespace: "quotes" });

  // 7. loopx — drive the agent until it produces a normalized quote
  const { final } = await stack.runAgentLoop(agent, "get a price quote for Acme", {
    maxIterations: 3,
    sessionId: ids.time(),
    until: (res) => res.success && typeof res.output?.amount === "number",
  });

  await memory.record({ task: "quote for Acme", toolsUsed: ["get_quote"], outcome: final.success ? "success" : "error", summary: JSON.stringify(final.output) });
  detachLogs();

  console.log("\nRESULT");
  console.log("  settings:", settings);
  console.log("  output:  ", final.output);
  console.log("  recalled:", (await memory.search("Acme quote")).length, "prior session(s)");

  // 8. asyncx — fan the agent out over many customers with a concurrency cap
  const orch = new Orchestrator(); orch.register("quote", agent);
  const batch = await stack.boundedParallel(
    orch,
    ["Acme", "Globex", "Initech", "Umbrella"].map((c) => ({ agent: "quote", input: `price for ${c}` })),
    { concurrency: 2 });
  console.log("  batch:   ", batch.outputs.map((o) => `${o.success}`).join(", "), `(concurrency 2)`);
})().catch((e) => { console.error(e); process.exit(1); });
