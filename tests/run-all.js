"use strict";
const { createAgent, IntentParser, ToolRegistry, ActionRouter, ExecutionEngine, MemoryLayer, InMemoryAdapter, Guardrails } = require("../index");

let passed = 0, failed = 0;
async function test(name, fn) {
  try   { await fn(); passed++; process.stdout.write(`  ✓ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ✗ ${name}\n    → ${e.message}\n`); }
}
const assert      = (c, m)    => { if (!c) throw new Error(m || "assertion failed"); };
const assertEqual = (a, b, m) => { if (a !== b) throw new Error(m || `${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

// ── Intent Parser ──────────────────────────────────────────────────────────────
async function testIntent() {
  console.log("\n📝 Intent Parser");
  const p = new IntentParser({ fallbackRules: [
    { pattern: /send\s+invoice\s+to\s+(\w+)\s+for\s+\$?([\d]+)/i, action: "send_invoice", extract: m => ({ user: m[1], amount: parseFloat(m[2]) }), confidence: 0.9 },
    { pattern: /send\s+email\s+to\s+(\S+)/i, action: "send_email", extract: m => ({ to: m[1] }), confidence: 0.85 },
  ]});
  await test("parses invoice intent",             async () => { const i = await p.parse("send invoice to John for $200"); assertEqual(i.action, "send_invoice"); assertEqual(i.params.user, "John"); assertEqual(i.params.amount, 200); });
  await test("parses email intent",               async () => { const i = await p.parse("send email to bob@x.com"); assertEqual(i.action, "send_email"); });
  await test("returns unknown for no match",      async () => { const i = await p.parse("fly me to the moon"); assertEqual(i.action, "unknown"); assertEqual(i.confidence, 0); });
  await test("throws on empty input",             async () => { let t=false; try { await p.parse(""); } catch { t=true; } assert(t); });
  await test("trims whitespace",                  async () => { const i = await p.parse("  send invoice to Alice for $100  "); assertEqual(i.action, "send_invoice"); });
}

// ── Tool Registry ──────────────────────────────────────────────────────────────
async function testRegistry() {
  console.log("\n🔧 Tool Registry");
  await test("registers and retrieves",           () => { const r = new ToolRegistry(); r.register({ name: "t", description: "d", handler: async () => {} }); assert(r.has("t")); assertEqual(r.get("t").name, "t"); });
  await test("prevents duplicates",               () => { const r = new ToolRegistry(); const d = { name: "x", description: "d", handler: async () => {} }; r.register(d); let t=false; try { r.register(d); } catch { t=true; } assert(t); });
  await test("allows override",                   () => { const r = new ToolRegistry(); r.register({ name: "t2", description: "old", handler: async () => {} }); r.override({ name: "t2", description: "new", handler: async () => {} }); assertEqual(r.get("t2").description, "new"); });
  await test("lists tools",                       () => { const r = new ToolRegistry(); r.register({ name: "a", description: "A", handler: async () => {} }); r.register({ name: "b", description: "B", handler: async () => {} }); assertEqual(r.list().length, 2); });
  await test("unregisters",                       () => { const r = new ToolRegistry(); r.register({ name: "rm", description: "d", handler: async () => {} }); r.unregister("rm"); assert(!r.has("rm")); });
  await test("validates missing handler",         () => { const r = new ToolRegistry(); let t=false; try { r.register({ name: "bad", description: "d" }); } catch { t=true; } assert(t); });
}

// ── Action Router ──────────────────────────────────────────────────────────────
async function testRouter() {
  console.log("\n🔀 Action Router");
  const r = new ToolRegistry();
  r.register({ name: "greet", description: "Greet", schema: { name: "string" }, handler: async ({ name }) => `Hello ${name}!` });
  const router = new ActionRouter(r);
  await test("routes valid intent",               async () => { const { tool, args } = await router.route({ action: "greet", params: { name: "World" }, confidence: 0.9 }); assertEqual(tool.name, "greet"); assertEqual(args.name, "World"); });
  await test("throws on unknown action",          async () => { let t=false; try { await router.route({ action: "unknown", params: {}, raw: "?" }); } catch { t=true; } assert(t); });
  await test("throws on missing tool",            async () => { let t=false; try { await router.route({ action: "nope", params: {}, confidence: 0.9 }); } catch { t=true; } assert(t); });
  await test("throws on missing required param",  async () => { let t=false; try { await router.route({ action: "greet", params: {}, confidence: 0.9 }); } catch { t=true; } assert(t); });
  await test("coerces string to number",          async () => { const r2 = new ToolRegistry(); r2.register({ name: "add", description: "add", schema: { a: "number", b: "number" }, handler: async ({ a, b }) => a+b }); const { args } = await new ActionRouter(r2).route({ action: "add", params: { a: "5", b: "3" }, confidence: 0.9 }); assertEqual(args.a, 5); assertEqual(args.b, 3); });
}

// ── Execution Engine ───────────────────────────────────────────────────────────
async function testEngine() {
  console.log("\n⚙️  Execution Engine");
  const eng = new ExecutionEngine({ timeout: 1000 });
  const ok  = { name: "ok",    options: {}, handler: async ({ v }) => ({ doubled: v * 2 }) };
  const bad = { name: "bad",   options: {}, handler: async () => { throw new Error("boom"); } };
  const slow = { name: "slow", options: { timeout: 100 }, handler: async () => new Promise(r => setTimeout(r, 5000)) };
  await test("returns success result",            async () => { const r = await eng.execute(ok, { v: 5 }); assert(r.success); assertEqual(r.output.doubled, 10); });
  await test("returns error result on failure",   async () => { const r = await eng.execute(bad, {}); assert(r.failed); assert(r.error.message.includes("boom")); });
  await test("times out slow tools",              async () => { const r = await eng.execute(slow, {}); assert(r.failed); assertEqual(r.error.name, "ExecutionTimeoutError"); });
  await test("retries on failure",                async () => { let n=0; const flaky = { name: "f", options: { retries: 2 }, handler: async () => { if (++n < 3) throw new Error("not yet"); return "ok"; } }; const r = await eng.execute(flaky, {}); assert(r.success); assertEqual(n, 3); });
  await test("result.toJSON() works",             async () => { const r = await eng.execute(ok, { v: 3 }); const j = r.toJSON(); assert(j.status === "success"); assert(j.output.doubled === 6); });
}

// ── Memory Layer ───────────────────────────────────────────────────────────────
async function testMemory() {
  console.log("\n🧠 Memory Layer");
  await test("set and get",                       () => { const m = new MemoryLayer(); m.set("k","v"); assertEqual(m.get("k"), "v"); });
  await test("returns null for missing key",      () => { assertEqual(new MemoryLayer().get("nope"), null); });
  await test("deletes key",                       () => { const m = new MemoryLayer(); m.set("d",1); m.delete("d"); assert(!m.has("d")); });
  await test("clears all",                        () => { const m = new MemoryLayer(); m.set("a",1); m.set("b",2); m.clear(); assertEqual(m.get("a"), null); });
  await test("conversation history",              () => { const m = new MemoryLayer(); m.addMessage("user","Hi"); m.addMessage("agent","Hello"); const h = m.getHistory(); assertEqual(h.length, 2); assertEqual(h[0].role, "user"); });
  await test("history limit",                     () => { const m = new MemoryLayer(); for(let i=0;i<10;i++) m.addMessage("user",`msg${i}`); assertEqual(m.getHistory(3).length, 3); });
  await test("persists to adapter",               async () => { const m = new MemoryLayer({ adapter: new InMemoryAdapter() }); await m.persist("k","v"); const v = await m.recall("k"); assertEqual(v, "v"); });
  await test("evicts oldest at capacity",         () => { const m = new MemoryLayer({ maxShortTermItems: 3 }); m.set("a",1); m.set("b",2); m.set("c",3); m.set("d",4); assertEqual(m.get("a"), null); assert(m.has("d")); });
  await test("snapshot returns current state",    () => { const m = new MemoryLayer(); m.set("x",42); const s = m.snapshot(); assertEqual(s.x, 42); });
}

// ── Guardrails ─────────────────────────────────────────────────────────────────
async function testGuardrails() {
  console.log("\n🛡️  Guardrails");
  await test("sanitizes input",                   () => { assertEqual(new Guardrails().sanitizeInput("  hello  "), "hello"); });
  await test("throws on input too long",          () => { let t=false; try { new Guardrails({ maxInputLength: 5 }).sanitizeInput("toolong"); } catch { t=true; } assert(t); });
  await test("validates known intent",            () => { assert(new Guardrails().validateIntent({ action: "x", params: {}, confidence: 0.9 })); });
  await test("blocks unknown intent",             () => { let t=false; try { new Guardrails().validateIntent({ action: "unknown" }); } catch { t=true; } assert(t); });
  await test("blocks blacklisted actions",        () => { let t=false; try { new Guardrails({ blockedActions: ["del"] }).validateIntent({ action: "del", confidence: 0.9 }); } catch { t=true; } assert(t); });
  await test("enforces allowedActions",           () => { let t=false; try { new Guardrails({ allowedActions: ["a"] }).validateIntent({ action: "b", confidence: 0.9 }); } catch { t=true; } assert(t); });
  await test("blocks low confidence",             () => { let t=false; try { new Guardrails().validateIntent({ action: "x", confidence: 0.1 }); } catch { t=true; } assert(t); });
  await test("custom sanitizer",                  () => { const g = new Guardrails(); g.addInputSanitizer(s => s.replace(/bad/gi, "***")); assertEqual(g.sanitizeInput("remove bad word"), "remove *** word"); });
}

// ── Full Agent Pipeline ────────────────────────────────────────────────────────
async function testPipeline() {
  console.log("\n🤖 Full Agent Pipeline");
  const agent = createAgent({
    tools: [
      { name: "add",   description: "Add numbers", schema: { a: "number", b: "number" }, handler: async ({ a, b }) => ({ result: a + b }) },
      { name: "greet", description: "Greet person", schema: { name: "string" }, handler: async ({ name }) => ({ greeting: `Hello, ${name}!` }) },
    ],
    rules: [
      { pattern: /add\s+([\d]+)\s+(?:and|plus|\+)\s+([\d]+)/i, action: "add",   extract: m => ({ a: parseFloat(m[1]), b: parseFloat(m[2]) }), confidence: 0.95 },
      { pattern: /(?:say\s+)?hello\s+to\s+(\w+)/i,             action: "greet", extract: m => ({ name: m[1] }), confidence: 0.9 },
    ],
  });
  await test("add_numbers succeeds",              async () => { const r = await agent.run("add 5 and 3"); assert(r.success); assertEqual(r.output.result, 8); });
  await test("greet succeeds",                    async () => { const r = await agent.run("say hello to Alice"); assert(r.success); assertEqual(r.output.greeting, "Hello, Alice!"); });
  await test("unresolvable returns failure",      async () => { const r = await agent.run("buy me a sandwich"); assert(!r.success); assert(r.error !== null); });
  await test("builds conversation history",       async () => { agent.reset(); await agent.run("add 1 and 1"); await agent.run("say hello to Bob"); assert(agent.getHistory().length >= 4); });
  await test("inspect() returns agent state",     () => { const s = agent.inspect(); assert(Array.isArray(s.tools)); assert(s.tools.includes("add")); });
  await test("addTool() at runtime",              () => { agent.addTool({ name: "now", description: "Get time", schema: {}, handler: async () => ({ time: new Date().toISOString() }) }); assert(agent.registry.has("now")); });
  await test("middleware transforms input",       async () => { const a2 = createAgent({ tools: [{ name: "echo", description: "echo", schema: { input: { type: "string", required: false, default: "" } }, handler: async ({ input }) => input }], rules: [{ pattern: /echo\s+(.+)/i, action: "echo", extract: m => ({ input: m[1] }), confidence: 0.9 }] }); a2.use(async input => input.toLowerCase()); const r = await a2.run("ECHO HELLO"); assert(r.success); });
  await test("stream() emits events",             async () => { const events = []; const a3 = createAgent({ tools: [{ name: "add2", description: "add", schema: { a: "number", b: "number" }, handler: async ({ a, b }) => ({ result: a+b }) }], rules: [{ pattern: /add\s+([\d]+)\s+and\s+([\d]+)/i, action: "add2", extract: m => ({ a: parseFloat(m[1]), b: parseFloat(m[2]) }), confidence: 0.9 }] }); await a3.stream("add 2 and 2", (stage) => events.push(stage)); assert(events.includes("intent")); assert(events.includes("done")); });
  await test("EventBus emits agent.run",          async () => { let fired=false; agent.events.on("agent.run", () => fired=true); await agent.run("add 1 and 1"); assert(fired); });
}

async function main() {
  console.log("\n🧪 @munesoft/agent — Core Test Suite\n" + "=".repeat(52));
  await testIntent();
  await testRegistry();
  await testRouter();
  await testEngine();
  await testMemory();
  await testGuardrails();
  await testPipeline();
  console.log(`\n${"=".repeat(52)}\n✅ Passed: ${passed}  ❌ Failed: ${failed}  Total: ${passed+failed}`);
  if (failed) process.exit(1);
  else console.log("🎉 All core tests passed!\n");
}
main().catch(e => { console.error(e); process.exit(1); });
