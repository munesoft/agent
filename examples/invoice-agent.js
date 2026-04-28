"use strict";
const { createAgent } = require("../index");

const agent = createAgent({
  tools: [
    { name: "send_invoice",  description: "Send an invoice",     schema: { user: "string", amount: { type: "number", required: true }, currency: { type: "string", required: false, default: "USD" } }, handler: async ({ user, amount, currency }) => { console.log(`  📄 Invoice → ${user}: ${currency} ${amount}`); return { invoiceId: `INV-${Date.now()}`, recipient: user, amount, status: "sent" }; } },
    { name: "send_email",    description: "Send an email",       schema: { to: "string", subject: "string", body: { type: "string", required: false, default: "" } }, handler: async ({ to, subject }) => { console.log(`  📧 Email → ${to}: "${subject}"`); return { messageId: `msg_${Date.now()}`, status: "delivered" }; } },
    { name: "create_task",   description: "Create a task",       schema: { title: "string", assignee: { type: "string", required: false } }, handler: async ({ title, assignee }) => { console.log(`  ✅ Task: "${title}"${assignee ? ` → ${assignee}` : ""}`); return { taskId: `task_${Date.now()}`, title, status: "open" }; } },
    { name: "lookup_user",   description: "Look up a user",      schema: { query: "string" }, handler: async ({ query }) => { const db = { john: { name: "John Smith", plan: "Pro" }, sarah: { name: "Sarah Lee", plan: "Enterprise" } }; const u = db[query.toLowerCase().split(" ")[0]]; console.log(`  👤 Found: ${u?.name || "not found"}`); return u ? { found: true, ...u } : { found: false }; } },
  ],
  rules: [
    { pattern: /send\s+invoice\s+to\s+(\w+)\s+for\s+\$?([\d,]+)/i,   action: "send_invoice", extract: m => ({ user: m[1], amount: parseFloat(m[2].replace(",","")) }), confidence: 0.95 },
    { pattern: /send\s+(?:an?\s+)?email\s+to\s+(\S+)\s+(?:about|re:)?\s*(.+)/i, action: "send_email",  extract: m => ({ to: m[1], subject: m[2] }), confidence: 0.9 },
    { pattern: /create\s+(?:a\s+)?task\s+(?:for\s+)?(.+)/i,           action: "create_task",  extract: m => ({ title: m[1] }), confidence: 0.85 },
    { pattern: /look\s*up\s+(?:user\s+)?(.+)/i,                        action: "lookup_user",  extract: m => ({ query: m[1] }), confidence: 0.88 },
  ],
  guardrails: { maxInputLength: 500 },
});

// Listen to events
agent.events.on("intent.parsed",  ({ intent })         => console.log(`  [event] intent: ${intent.action} (${intent.confidence})`));
agent.events.on("tool.executed",  ({ tool, duration }) => console.log(`  [event] executed: ${tool} in ${duration}ms`));

async function run() {
  console.log("\n🤖 Invoice Agent Demo\n" + "=".repeat(44));
  const commands = [
    "Send invoice to John for $200",
    "Send an email to sarah@example.com about Q3 Report",
    "Create a task for following up with enterprise clients",
    "Look up user Sarah",
    "Send invoice to John for $1,500",
  ];
  for (const cmd of commands) {
    console.log(`\n> ${cmd}`);
    const r = await agent.run(cmd);
    if (r.success) console.log(`  ✓ ${r.tool} — ${JSON.stringify(r.output).slice(0, 80)}`);
    else           console.log(`  ✗ ${r.error?.message}`);
  }
  console.log("\n" + "=".repeat(44) + "\n✅ Done\n");
}
run().catch(console.error);
