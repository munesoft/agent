"use strict";
/**
 * Router Brain + Verification + auto-repair, with no API key (rule-based intent).
 * Run: node examples/verified-agent.js
 */
const { createAgent, checks } = require("../index");

let attempt = 0;
const agent = createAgent({
  name: "invoice-agent",
  tools: [{
    name: "create_invoice",
    description: "generate an invoice with a positive total for a customer",
    aliases: ["make_bill", "bill_customer"],
    schema: { customer: "string", amount: { type: "number", min: 0 } },
    handler: async ({ customer, amount }) => {
      attempt++;
      // Simulate a flaky first result that fails verification, then a good one.
      const total = attempt >= 2 ? amount * 1.16 : 0;
      return { invoiceId: `INV-${Date.now()}`, customer, total: Number(total.toFixed(2)) };
    },
  }],
  rules: [{ pattern: /invoice|bill/i, action: "create_invoice", extract: (m, input) => ({ customer: (input.match(/for (\w+)/)?.[1]) || "Acme", amount: Number(input.match(/\d+/)?.[0]) || 100 }) }],
  guardrails: { redactSecrets: true },
  verify: { checks: [ checks.hasKeys(["invoiceId", "total"]), checks.range("total", { min: 0.01 }) ] },
  maxRepairs: 2,
});

agent.events.on("*", (e) => console.log(`  event: ${e.event}`));

(async () => {
  const res = await agent.run("create an invoice for Acme of 250");
  console.log("\nRESULT");
  console.log("  success:     ", res.success);
  console.log("  routed via:  ", res.decision.strategy, `(score ${res.decision.score})`);
  console.log("  repairs:     ", res.repairs);
  console.log("  verification:", res.verification.passed, `score=${res.verification.score}`);
  console.log("  output:      ", res.output);
})();
