"use strict";
/**
 * Munesoft-stack integration tests. These exercise the opt-in adapter layer.
 * Each adapter's package is an OPTIONAL peer dependency, so a test is skipped
 * (not failed) when its package isn't installed — keeping this suite green in a
 * bare, zero-dependency checkout while still fully covering an installed stack.
 */
const assert = require("assert");
const I = require("../packages/integrations");
const { createAgent, Orchestrator } = require("../index");

let pass = 0, fail = 0, skip = 0;
async function test(name, pkg, fn) {
  if (pkg && !I.isAvailable(pkg)) { skip++; console.log(`  ⚠ SKIP ${name} (npm install ${pkg})`); return; }
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack || e.message}`); }
}

const mkAgent = () => createAgent({
  name: "t", guardrails: false,
  tools: [{ name: "do", description: "do work", schema: {}, handler: async () => ({ done: true }) }],
  rules: [{ pattern: /.*/, action: "do", extract: () => ({}) }],
});

(async () => {
  console.log("\n🧩 @munesoft/agent — Stack Integration Suite\n" + "=".repeat(56));

  console.log("\n── loader / barrel ──");
  await test("barrel loads without any package", null, () => {
    assert.ok(typeof I.retryableTool === "function" && typeof I.createMemoryxStore === "function");
    assert.ok(typeof I.IntegrationError === "function");
  });
  await test("stackStatus reports all 9 packages", null, () => {
    const s = I.stackStatus();
    assert.equal(Object.keys(s).length, 9);
  });
  await test("missing package throws a friendly IntegrationError", null, () => {
    let err;
    try { I.safeGet.__proto__; require("../packages/integrations/_load").requireDep("@munesoft/does-not-exist", "x"); }
    catch (e) { err = e; }
    assert.ok(err && err.name === "IntegrationError" && /npm install/.test(err.message));
  });

  console.log("\n── @munesoft/idx ──");
  await test("idFactory + withStableIds", "@munesoft/idx", () => {
    const f = I.idFactory({ prefix: "run" });
    assert.ok(/^run_/.test(f.id()) && typeof f.time() === "string");
    const ctx = I.withStableIds({});
    assert.ok(typeof ctx.sessionId === "string" && ctx.sessionId.startsWith("sess_"));
  });

  console.log("\n── @munesoft/objx ──");
  await test("mergeSettings + safeGet + applyDefaults", "@munesoft/objx", () => {
    const m = I.mergeSettings({ a: { x: 1 } }, { a: { y: 2 }, b: 3 });
    assert.equal(m.a.x, 1); assert.equal(m.a.y, 2); assert.equal(m.b, 3);
    assert.equal(I.safeGet(m, "a.y"), 2);
    assert.equal(I.safeGet(m, "z.q", "d"), "d");
    assert.equal(I.applyDefaults({ a: 1 }, { a: 9, c: 3 }).c, 3);
  });

  console.log("\n── @munesoft/api-normalizer ──");
  await test("normalizeResponse coerces + maps", "@munesoft/api-normalizer", () => {
    const r = I.normalizeResponse({ Name: "Ann", Age: "30" }, { name: ["Name"], age: { keys: ["Age"], type: "number" } }, { coerceTypes: true });
    assert.ok(r.success); assert.equal(r.data.name, "Ann"); assert.equal(r.data.age, 30);
  });
  await test("normalizingTool normalizes output", "@munesoft/api-normalizer", async () => {
    const tool = I.normalizingTool(
      { name: "u", description: "d", handler: async () => ({ Name: "Bo" }) },
      { name: ["Name"] });
    assert.deepEqual(await tool.handler({}, {}), { name: "Bo" });
  });

  console.log("\n── @munesoft/retryx ──");
  await test("retryableTool retries a flaky handler", "@munesoft/retryx", async () => {
    let n = 0;
    const tool = I.retryableTool({ name: "x", description: "d", handler: async () => { if (++n < 3) throw new Error("boom"); return { n }; } }, { retries: 5, delay: 2 });
    assert.equal((await tool.handler({}, {})).n, 3);
  });

  console.log("\n── @munesoft/memoryx ──");
  await test("createMemoryxStore record + search (SessionStore shape)", "@munesoft/memoryx", async () => {
    const store = I.createMemoryxStore({ namespace: "test" });
    await store.record({ task: "add retry to payment client", filesTouched: ["src/pay.ts"], decisions: ["exponential backoff"], outcome: "success" });
    const hits = await store.search("payment retry");
    assert.ok(Array.isArray(hits) && hits.length >= 1);
    assert.ok(typeof hits[0].id === "string" && "snippet" in hits[0] && "session" in hits[0]);
  });
  await test("memoryx store plugs into makeRecallTool", "@munesoft/memoryx", async () => {
    const { makeRecallTool } = require("../index");
    const store = I.createMemoryxStore({ namespace: "test2" });
    await store.record({ task: "migration rollback on orders", filesTouched: ["migrations/003.sql"], outcome: "error" });
    const tool = makeRecallTool(store);
    const out = await tool.handler({ query: "migration rollback" }, {});
    assert.ok(out.found >= 1);
  });

  console.log("\n── @munesoft/loopx ──");
  await test("runAgentLoop iterates until success", "@munesoft/loopx", async () => {
    const r = await I.runAgentLoop(mkAgent(), "go", { maxIterations: 3 });
    assert.ok(r.final.success === true && r.responses.length >= 1);
  });

  console.log("\n── @munesoft/envx (ESM) ──");
  await test("loadAgentEnv validates + coerces", "@munesoft/envx", async () => {
    process.env.__AGENT_TEST_PORT = "8080";
    const cfg = await I.loadAgentEnv({ __AGENT_TEST_PORT: { type: "number", default: 3000 } });
    assert.equal(Number(cfg.__AGENT_TEST_PORT), 8080);
  });

  console.log("\n── @munesoft/logx (ESM) ──");
  await test("attachLogx subscribes to the event bus", "@munesoft/logx", async () => {
    const detach = await I.attachLogx(mkAgent(), { events: ["agent.run"] });
    assert.equal(typeof detach, "function"); detach();
  });

  console.log("\n── @munesoft/asyncx (ESM) ──");
  await test("boundedParallel runs with a concurrency cap", "@munesoft/asyncx", async () => {
    const orch = new Orchestrator(); orch.register("t", mkAgent());
    const r = await I.boundedParallel(orch, [{ agent: "t", input: "a" }, { agent: "t", input: "b" }, { agent: "t", input: "c" }], { concurrency: 2 });
    assert.ok(r.success && r.outputs.length === 3);
  });

  console.log(`\n${"=".repeat(56)}\n✅ Passed: ${pass}  ⚠ Skipped: ${skip}  ❌ Failed: ${fail}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
