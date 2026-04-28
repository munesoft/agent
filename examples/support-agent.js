"use strict";
const { createAgent, MemoryLayer, InMemoryAdapter } = require("../index");

const ticketDB = new Map(); let counter = 1000;

const agent = createAgent({
  tools: [
    { name: "create_ticket",        description: "Create a support ticket",              schema: { customer_email: "string", issue: "string", priority: { type: "string", required: false, default: "normal" } }, handler: async ({ customer_email, issue, priority }) => { const id = `TKT-${++counter}`; const t = { id, customer_email, issue, priority, status: "open", created_at: new Date().toISOString() }; ticketDB.set(id, t); console.log(`  🎫 Created ${id} [${priority}]`); return t; } },
    { name: "get_ticket",           description: "Get ticket status",                    schema: { ticket_id: "string" }, handler: async ({ ticket_id }) => { const t = ticketDB.get(ticket_id.toUpperCase()); return t ? { found: true, ...t } : { found: false }; } },
    { name: "escalate_ticket",      description: "Escalate a ticket",                   schema: { ticket_id: "string", reason: { type: "string", required: false, default: "Customer request" } }, handler: async ({ ticket_id }) => { const t = ticketDB.get(ticket_id.toUpperCase()); if (!t) return { success: false }; t.priority = "urgent"; t.escalated = true; console.log(`  🚨 Escalated ${ticket_id}`); return { success: true, ticket_id, new_priority: "urgent" }; } },
    { name: "search_knowledge_base", description: "Search knowledge base",              schema: { query: "string" }, handler: async ({ query }) => { const kb = [{ id: "KB001", title: "Password reset guide", tags: ["password","login"] }, { id: "KB002", title: "Billing & refunds", tags: ["billing","refund","payment"] }, { id: "KB003", title: "Cancel subscription", tags: ["cancel","subscription"] }]; const q = query.toLowerCase(); const results = kb.filter(a => a.tags.some(t => q.includes(t))); console.log(`  📚 Found ${results.length} article(s)`); return { query, results, count: results.length }; } },
    { name: "close_ticket",         description: "Close a resolved ticket",             schema: { ticket_id: "string", resolution: { type: "string", required: false, default: "Resolved" } }, handler: async ({ ticket_id }) => { const t = ticketDB.get(ticket_id.toUpperCase()); if (t) { t.status = "closed"; t.closed_at = new Date().toISOString(); } console.log(`  ✅ Closed ${ticket_id}`); return { success: !!t, ticket_id, status: "closed" }; } },
  ],
  rules: [
    { pattern: /(?:create|open|new)\s+(?:a\s+)?ticket\s+for\s+(.+)/i,     action: "create_ticket",        extract: m => ({ customer_email: "customer@example.com", issue: m[1] }), confidence: 0.9 },
    { pattern: /(?:check|get|status\s+of)\s+(?:ticket\s+)?(TKT-?\d+)/i,   action: "get_ticket",           extract: m => ({ ticket_id: m[1] }), confidence: 0.95 },
    { pattern: /escalate\s+(?:ticket\s+)?(TKT-?\d+)/i,                    action: "escalate_ticket",      extract: m => ({ ticket_id: m[1] }), confidence: 0.9 },
    { pattern: /search\s+(?:for\s+)?(.+)/i,                                action: "search_knowledge_base",extract: m => ({ query: m[1] }), confidence: 0.8 },
    { pattern: /close\s+(?:ticket\s+)?(TKT-?\d+)/i,                       action: "close_ticket",         extract: m => ({ ticket_id: m[1] }), confidence: 0.9 },
  ],
  memory: { adapter: new InMemoryAdapter() },
  execution: { timeout: 5000, retries: 1 },
});

async function run() {
  console.log("\n🎧 Support Agent Demo (with streaming)\n" + "=".repeat(48));
  let ticketId;

  // Step 1: Create via streaming
  console.log("\n> Create ticket for billing issue");
  await agent.stream("Create a ticket for billing issue — double charged", (stage, data) => {
    if (stage === "intent")    console.log(`  [stream] intent → ${data.intent.action}`);
    if (stage === "routing")   console.log(`  [stream] routing → ${data.tool}`);
    if (stage === "executed")  { ticketId = data.output?.id; console.log(`  [stream] done → ${ticketId}`); }
  });

  // Step 2: Check
  console.log(`\n> Check ${ticketId}`);
  const r2 = await agent.run(`Check ticket ${ticketId}`);
  console.log(`  ✓ Status: ${r2.output?.status}`);

  // Step 3: Search
  console.log("\n> Search KB for billing refund");
  const r3 = await agent.run("Search for billing refund");
  r3.output?.results?.forEach(a => console.log(`  📄 ${a.id}: ${a.title}`));

  // Step 4: Escalate
  console.log(`\n> Escalate ${ticketId}`);
  const r4 = await agent.run(`Escalate ticket ${ticketId}`);
  console.log(`  ✓ Priority → ${r4.output?.new_priority}`);

  // Step 5: Close
  console.log(`\n> Close ${ticketId}`);
  const r5 = await agent.run(`Close ticket ${ticketId}`);
  console.log(`  ✓ ${r5.output?.ticket_id} ${r5.output?.status}`);

  console.log("\n" + "=".repeat(48) + "\n✅ Done\n");
}
run().catch(console.error);
