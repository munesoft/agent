# @munesoft/agent

> **Build reliable AI agents in minutes.**
> The Express.js for AI agents — modular, typed, production-ready.

[![npm version](https://img.shields.io/npm/v/@munesoft/agent.svg)](https://www.npmjs.com/package/@munesoft/agent)
[![npm downloads](https://img.shields.io/npm/dm/@munesoft/agent.svg)](https://www.npmjs.com/package/@munesoft/agent)
[![install size](https://img.shields.io/bundlephobia/minzip/@munesoft/agent.svg)](https://bundlephobia.com/package/@munesoft/agent)
[![node](https://img.shields.io/node/v/@munesoft/agent.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@munesoft/agent.svg)](./LICENSE)
![tests](https://img.shields.io/badge/tests-200%20passing-brightgreen)
![munesoft stack](https://img.shields.io/badge/munesoft%20stack-9%20integrations-8a2be2)

---

## What is Munesoft Agent Framework?

Infrastructure for **real AI agents** — not chatbot wrappers. An agent turns natural
language into a **validated tool call**, runs it, then **checks the result actually
satisfied the task** before returning. Every stage of that pipeline is pluggable:

```
sanitize → parse intent → guardrails → ROUTER BRAIN → execute → VERIFY → repair → memory → events
```

- **Router Brain** — scored multi-strategy resolution (exact · alias · tag · fuzzy · keyword) + schema validation
- **Verification + auto-repair** — check outputs for correctness and re-run with feedback until they pass
- **Session memory** — searchable episodic history so a later agent knows what earlier runs already did
- **File-safe orchestration** — multiple agents in parallel without stomping on each other's files
- **Hardened guardrails** — input sanitization, secret/PII redaction, rate limits, allow/block lists
- **21 LLM providers · 23 framework bridges** — every major model + plug into any ecosystem
- **Multi-agent orchestration & visual workflows** — pipelines, parallel, routing, handoff, node graphs
- **Munesoft-stack integrations** — opt-in adapters for retryx, asyncx, logx, envx, idx, objx, memoryx, loopx, api-normalizer
- **Zero-dependency core** — pure Node.js (>= 16), CommonJS. Integrations are optional peer deps you install only if you use them

```js
const { createAgent, createLLM, checks } = require("@munesoft/agent");

const agent = createAgent({
  tools,
  llmProvider: createLLM("claude", { apiKey: process.env.ANTHROPIC_API_KEY }),
  verify:      { checks: [ checks.hasKeys(["invoiceId", "total"]) ] },
  maxRepairs:  2,
});

const res = await agent.run("Send invoice to John for $200");
// → { success, output, tool, decision, verification, repairs, steps, sessionId }
```

> **Upgrading from 1.x?** `route()` is now **async** and `agent.run()` resolves to a
> richer `AgentResponse` (adds `decision`, `verification`, `repairs`, `steps`). This is
> the breaking change behind the 2.0 bump — `await` your router calls.
>
> **New in 3.0 —** the opt-in [Munesoft Stack Integration](#munesoft-stack-integration)
> layer at `@munesoft/agent/integrations`. The core stays zero-dependency; adapters
> lazy-load their package only when called.

---

## Install

```bash
npm install @munesoft/agent
```

---

## Quickstart

### Without an LLM (rule-based, works instantly)

```js
const { createAgent } = require("@munesoft/agent");

const agent = createAgent({
  tools: [{
    name: "send_email",
    description: "Send an email to a recipient",
    schema: { to: "string", subject: "string" },
    handler: async ({ to, subject }) => ({ messageId: "msg_001", status: "sent" }),
  }],
  rules: [{
    pattern: /send\s+email\s+to\s+(\S+)\s+about\s+(.+)/i,
    action: "send_email",
    extract: (match) => ({ to: match[1], subject: match[2] }),
    confidence: 0.9,
  }],
});

const result = await agent.run("Send email to john@example.com about Q3 Report");
console.log(result.output);            // { messageId: "msg_001", status: "sent" }
console.log(result.decision.strategy); // "exact"
```

### With an LLM + native function calling

```js
const { createAgent, createLLM } = require("@munesoft/agent");

const llm   = createLLM("openai", { apiKey: process.env.OPENAI_API_KEY });
const agent = createAgent({ tools, llmProvider: llm });
const result = await agent.run("Send invoice to Sarah for $500");
```

---

## Router Brain

`route()` resolves an intent to a concrete tool by **scoring across strategies** instead
of a single exact-name lookup, then coerces + validates arguments against the tool schema.

| Order | Strategy | How it matches |
|:-:|----------|----------------|
| 1 | `exact` | intent action === tool name (score `1.00`) |
| 2 | `alias` | router-level `{ alias: tool }` map, or a tool's `aliases: []` |
| 3 | `tag` | a single tool tagged with the action |
| 4 | `fuzzy` | Dice bigram similarity of action vs tool name |
| 5 | `keyword` | action tokens overlapping the tool name + description |

A confidence floor (`threshold`, default `0.45`) rejects weak matches; a small
`ambiguityGap` flags ties, which an async `disambiguate()` (e.g. an LLM) or a
`fallbackTool` can break.

```js
const agent = createAgent({
  tools,
  routing: {
    threshold:    0.5,
    aliases:      { make_bill: "create_invoice" },
    fallbackTool: "handoff_to_human",
    disambiguate: async (intent, candidates) => candidates[0].name,
  },
});

const res = await agent.run("bill Acme for 250");
res.decision; // { strategy: "alias", tool: "create_invoice", score: 0.95, candidates: [...] }
```

Schema validation covers types, `enum`, `min`/`max`, `minLength`/`maxLength`, `pattern`,
array `items`, and `default`s — invalid args throw `SchemaValidationError`.

---

## Verification + Auto-Repair

Guardrails answer *"is this allowed?"*. The **Verifier** answers *"is this correct/complete?"*.
Wire checks into an agent with a repair budget and failed verifications re-run the tool with
the failure feedback injected at `ctx._verification` — until it passes or repairs run out.

```js
const { createAgent, checks } = require("@munesoft/agent");

const agent = createAgent({
  tools,
  verify:     { checks: [ checks.hasKeys(["invoiceId", "total"]), checks.range("total", { min: 0.01 }) ] },
  maxRepairs: 2,
});

const res = await agent.run("create an invoice for Acme of 250");
res.verification; // { passed: true, score: 1, checks: [...], feedback: "" }
res.repairs;      // 1  (failed once, repaired, then passed)
```

Built-in checks: `notEmpty`, `hasKeys`, `matches`, `type`, `range`, `jsonShape`,
`custom(fn)`, and `llmCheck(llm, criteria)` for model-graded self-critique. Or build a
standalone `Verifier`:

```js
const { Verifier, checks } = require("@munesoft/agent");
const report = await new Verifier()
  .check(checks.notEmpty())
  .check(checks.custom(o => o.total > 0 || "total must be positive"))
  .verify(output, { input, tool });
```

---

## Session Memory

Where `MemoryLayer` is a per-run KV + history cache, **`SessionStore`** is the long-lived,
*searchable* record of what agents actually did — intent, decisions, tools, files touched,
outcomes — one record per run ("episode"). Ranking is BM25 over an in-memory inverted index;
persistence is an append-only JSONL log. Zero dependencies.

```js
const { SessionStore, attachRecorder, makeRecallTool, createHistoryResearchAgent } = require("@munesoft/agent");

const store = new SessionStore({ path: ".agent-sessions/index.jsonl" });

// 1. Auto-capture every run of an agent from its event bus
const detach = attachRecorder(agent, store, { agentName: "billing" });

// 2. Give any agent a tool to search prior sessions mid-task
agent.addTool(makeRecallTool(store)); // → "search_prior_sessions"

// 3. Produce a pre-work brief of related prior sessions before editing
const researcher = createHistoryResearchAgent({ store });
const report = await researcher.research("harden payment retries", ["src/payments/client.ts"]);
console.log(report.brief); // cited snippets, files previously touched, known gotchas
```

`store.search(query, { file })` returns cited snippets with session IDs, so a later agent
can recover *where a decision came from* instead of repeating work.

---

## File-Safe Orchestration

`Orchestrator.parallel()` runs tasks concurrently — but concurrent agents editing the same
files is a classic footgun. `FileCoordinator` adds advisory file claims so overlapping edits
are **rejected** (default) or **serialized**, and `researchThenEdit()` wires the
"research subagent runs first, then editors run file-safely" pattern end to end.

```js
const { safeParallel, researchThenEdit, createHistoryResearchAgent } = require("@munesoft/agent");

// Declare the files each task intends to touch
await safeParallel(orch, [
  { agent: "editor-a", input: "update client", files: ["src/payments/client.ts"] },
  { agent: "editor-b", input: "update backoff", files: ["src/util/backoff.ts"] },
], { onConflict: "serialize" });

// Research-then-edit: prior context is injected into each editor's ctx.priorContext
const { report, execution } = await researchThenEdit({
  orchestrator: orch,
  researcher:   createHistoryResearchAgent({ store }),
  task:         "harden payment retries",
  editors:      [{ agent: "editor-a", input: (rep) => `context: ${rep.relatedSessions.length} prior`, files: ["src/payments/client.ts"] }],
});
```

---

## Guardrails

Safety layer around every run — all opt-in via `guardrails: { ... }`:

```js
const agent = createAgent({
  tools,
  guardrails: {
    redactSecrets:      true,         // mask API keys, JWTs, bearer tokens, cards, emails in input
    blockOutputSecrets: true,         // reject outputs that leak a credential
    allowedActions:     ["create_invoice", "send_email"],
    blockedActions:     ["delete_account"],
    minConfidence:      0.3,          // reject low-confidence intents
    rateLimit:          30,           // max runs...
    rateWindowMs:       60000,        // ...per sliding window
    maxInputLength:     10000,
    outputValidators:   [(out, tool) => out.total >= 0 || "total must be non-negative"],
  },
});
```

The `redact(str)` helper is also exported for standalone use. Set `guardrails: false` to
disable entirely.

---

## Munesoft Stack Integration

The agent framework has a **zero-dependency core**, but ships first-class, **opt-in**
adapters for the rest of the [munesoft stack](https://www.npmjs.com/org/munesoft) at
`@munesoft/agent/integrations`. Each adapter **lazy-loads its package only when called**,
so importing the layer is always safe — you only install what you actually use. The stack
packages are declared as **optional peer dependencies**.

```bash
# Install only the pieces you want — or the whole stack:
npm install @munesoft/retryx @munesoft/asyncx @munesoft/logx @munesoft/envx \
            @munesoft/idx @munesoft/objx @munesoft/api-normalizer \
            @munesoft/memoryx @munesoft/loopx
```

| Adapter | Package | What it does |
|---------|---------|--------------|
| `loadAgentEnv(schema)` | `@munesoft/envx` | Validate & type env/config before an agent boots |
| `attachLogx(agent)` | `@munesoft/logx` | Pipe the agent lifecycle into structured logs |
| `retryableTool(tool)` / `withRetry(fn)` | `@munesoft/retryx` | Wrap flaky tools/API calls with backoff + Retry-After |
| `boundedParallel(orch, tasks, {concurrency})` | `@munesoft/asyncx` | Concurrency-capped fan-out for background jobs |
| `idFactory()` / `withStableIds(ctx)` | `@munesoft/idx` | Collision-resistant, stable internal IDs |
| `mergeSettings()` / `safeGet()` | `@munesoft/objx` | Deep settings merge + null-safe nested access |
| `normalizeResponse()` / `normalizingTool()` | `@munesoft/api-normalizer` | Normalize messy external API/tool responses |
| `createMemoryxStore()` | `@munesoft/memoryx` | Semantic episodic memory as a `SessionStore`-shaped recall source |
| `runAgentLoop(agent, input)` | `@munesoft/loopx` | Drive multi-step AI loops with stop conditions |

```js
const { createAgent } = require("@munesoft/agent");
const {
  loadAgentEnv, attachLogx, retryableTool, normalizingTool,
  createMemoryxStore, runAgentLoop, boundedParallel, idFactory, mergeSettings,
} = require("@munesoft/agent/integrations");

// envx — fail fast if the API key is missing
const cfg = await loadAgentEnv({ OPENAI_API_KEY: { type: "string", required: true } });

// retryx + api-normalizer — a resilient, self-normalizing tool
const quote = retryableTool(
  normalizingTool(rawQuoteTool, { customer: ["Customer"], amount: { keys: ["PriceUSD"], type: "number" } }, { coerceTypes: true }),
  { retries: 3 });

const agent = createAgent({ tools: [quote], /* … */ });

// logx — structured logs for every stage
const detach = await attachLogx(agent);

// loopx — run until the output is a normalized quote
const { final } = await runAgentLoop(agent, "price for Acme", {
  until: (res) => typeof res.output?.amount === "number",
});

// memoryx — searchable episodic memory (plugs into makeRecallTool / research agents)
const memory = createMemoryxStore({ namespace: "quotes" });
await memory.record({ task: "quote for Acme", outcome: "success" });

// asyncx — fan out with a concurrency cap
const batch = await boundedParallel(orch, tasks, { concurrency: 5 });
```

`stackStatus()` reports which stack packages are installed — handy for diagnostics:

```js
const { stackStatus } = require("@munesoft/agent/integrations");
stackStatus(); // { "@munesoft/retryx": { installed: true, use: "safe, retryable API calls", ... }, ... }
```

See [`examples/stack-agent.js`](examples/stack-agent.js) for a full end-to-end showcase.

---

## LLM Providers

Every major provider. Same interface. Native function calling on all.

```js
const { createLLM } = require("@munesoft/agent");

const llm = createLLM("openai",      { apiKey: process.env.OPENAI_API_KEY });
const llm = createLLM("claude",      { apiKey: process.env.ANTHROPIC_API_KEY });
const llm = createLLM("gemini",      { apiKey: process.env.GEMINI_API_KEY });
const llm = createLLM("grok",        { apiKey: process.env.XAI_API_KEY });
const llm = createLLM("ollama",      { model: "llama3.2" });                              // local
const llm = createLLM("openrouter",  { apiKey: "...", model: "anthropic/claude-3.5-sonnet" }); // any model

// Shared API across every provider
await llm.complete({ system, user, format: "json" });
await llm.functionCall({ system, user, tools });
```

| Provider | Key | Provider | Key |
|----------|-----|----------|-----|
| **OpenAI** | `openai` / `gpt` | **Hugging Face** | `huggingface` / `hf` |
| **Anthropic Claude** | `claude` / `anthropic` | **Ollama (local)** | `ollama` / `local` |
| **Google Gemini** | `gemini` / `google` | **Together AI** | `together` |
| **Google Vertex AI** | `vertex` | **Groq** | `groq` |
| **Azure OpenAI** | `azure` / `microsoft` | **Fireworks AI** | `fireworks` |
| **AWS Bedrock** | `bedrock` / `aws` | **OpenRouter** | `openrouter` |
| **Mistral AI** | `mistral` | **AI21 Labs** | `ai21` / `jamba` |
| **Cohere** | `cohere` | **NovitaAI** | `novita` |
| **xAI Grok** | `grok` / `xai` | **DeepSeek** | `deepseek` |
| **Perplexity AI** | `perplexity` | **Alibaba Qwen** | `qwen` / `alibaba` |
| **Baidu ERNIE** | `ernie` / `baidu` | | |

```js
const { listProviders } = require("@munesoft/agent");
listProviders(); // every supported provider + alias
```

---

## Framework Bridges

Plug Munesoft into any AI ecosystem — bidirectionally. Use Munesoft tools inside other
frameworks, or wrap external frameworks as Munesoft tools.

```js
const { createBridge } = require("@munesoft/agent");

const bridge = createBridge("langchain");
const tools  = bridge.toTools(agent.registry);   // → DynamicStructuredTool[]

const mcp    = createBridge("mcp");
const handler = mcp.createServerHandler(agent.registry); // serve tools over MCP
```

**Agent frameworks:** LangChain · LangGraph · CrewAI · Microsoft AutoGen · OpenAI Agents SDK ·
OpenAI Swarm · LlamaIndex · Semantic Kernel · Haystack · SmolAgents · Agno · MetaGPT ·
SuperAGI · AgentGPT · OpenDevin · Flowise · Dust · AutoGPT
**Protocols:** Model Context Protocol (MCP) · Linux Foundation AAIF
**Automation:** n8n · Zapier · Make (Integromat)

```js
const { listBridges } = require("@munesoft/agent");
listBridges();
```

---

## Multi-Agent Orchestration

```js
const { Orchestrator } = require("@munesoft/agent");

const orch = new Orchestrator();
orch.register("research", researchAgent)
    .register("summary",  summaryAgent);

// Sequential pipeline
await orch.pipeline([
  { agent: "research", input: "research AI trends" },
  { agent: "summary",  input: (prev) => `summarize: ${JSON.stringify(prev.output)}` },
]);

// Parallel
await orch.parallel([
  { agent: "analyst", input: "analyze fintech" },
  { agent: "analyst", input: "analyze healthtech" },
]);

// Function or LLM routing, and handoff
await orch.route(input, (i, agents) => i.includes("analyze") ? "analyst" : "research");
await orch.llmRoute(input, llm, { research: "find info", analyst: "analyze data" });
orch.enableHandoff("research", ["analyst"]);
```

---

## Visual Workflow Builder

```js
const { WorkflowBuilder } = require("@munesoft/agent");

const workflow = new WorkflowBuilder({ name: "Support Ticket Flow" })
  .start("start")
  .agent("triage",    { agent: "triage",  input: (ctx) => ctx.issue })
  .condition("check", { condition: (ctx) => ctx.triage_output?.priority === "high", onTrue: "escalate", onFalse: "queue" })
  .agent("escalate",  { agent: "urgent",  input: (ctx) => ctx.triage_output?.ticketId })
  .agent("queue",     { agent: "normal",  input: (ctx) => ctx.triage_output?.ticketId })
  .transform("enrich", (ctx) => ({ ...ctx, processedAt: new Date().toISOString() }))
  .end("end")
  .connect("start","triage").connect("triage","check")
  .connect("escalate","enrich").connect("queue","enrich").connect("enrich","end")
  .build();

const result = await workflow.execute(orchestrator, { issue: "server is down URGENT" });
console.log(workflow.diagram());  // text diagram
const json = workflow.toJSON();   // export for a visual editor
```

---

## Events

```js
agent.events.on("intent.parsed",  ({ intent }) => {});
agent.events.on("tool.executed",  ({ tool, success, duration }) => {});
agent.events.on("verify.checked", ({ passed, score }) => {});
agent.events.on("repair.attempt", ({ attempt, feedback }) => {});
agent.events.on("*",              ({ event, ...data }) => {}); // all events

await agent.events.emitAsync("custom", { data });                 // await async handlers
const payload = await agent.events.waitFor("agent.run", { timeout: 5000 });
```

---

## Streaming

```js
await agent.stream("Send invoice to John for $200", (stage, data) => {
  if (stage === "intent")   console.log("Action:", data.intent.action);
  if (stage === "routing")  console.log("Routed via:", data.decision.strategy);
  if (stage === "verified") console.log("Verified:", data.passed);
  if (stage === "done")     console.log("Done in", data.response.duration, "ms");
});
```

---

## Project Structure

```
@munesoft/agent/
├── index.js                    # Barrel — every public export
├── index.d.ts                  # TypeScript definitions
├── llms.txt                    # Machine-readable overview for LLMs
├── packages/
│   ├── core/                   # Agent + verify/repair loop + Execution Engine
│   ├── intent/                 # Intent Parser (rules · LLM · function calling)
│   ├── router/                 # Router Brain (scored resolution + schema validation)
│   ├── verify/                 # Verification System + check factories
│   ├── memory/                 # MemoryLayer (namespaces, TTL) + adapters (atomic file writes)
│   ├── session/                # SessionStore, recorder, recall tool, history-research agent
│   ├── coordination/           # FileCoordinator, safeParallel, researchThenEdit
│   ├── guardrails/             # Sanitization, secret redaction, rate limits, validators
│   ├── tools/                  # Tool Registry (aliases, tags)
│   ├── events/                 # Event Bus (emitAsync, waitFor, wildcard)
│   ├── orchestrator/           # Multi-agent orchestrator (file-aware parallel)
│   ├── workflow/               # Visual Workflow Builder
│   ├── integrations/           # Opt-in munesoft-stack adapters (lazy-loaded)
│   └── llm/
│       ├── index.js            # Factory: createLLM, createBridge, listProviders/Bridges
│       ├── base.js             # BaseLLMAdapter (HTTP hardening: request timeout, non-2xx)
│       ├── providers/          # 21 LLM provider adapters
│       └── bridges/            # 23 framework bridges
├── examples/
│   ├── invoice-agent.js        support-agent.js     multi-agent.js
│   ├── workflow.js             verified-agent.js    research-then-edit.js
│   └── stack-agent.js          # Full munesoft-stack showcase
└── tests/
    ├── run-all.js              # Core suite (47)
    ├── run-v2.js               # v2 suite (136)
    ├── run-integration.js      # End-to-end orchestration (3)
    └── run-integrations.js     # Munesoft-stack adapters (14, self-skipping)
```

---

## Testing

```bash
npm test                # 186 core tests (core + v2 + integration) — zero deps required
npm run test:integrations  # 14 munesoft-stack adapter tests (skips packages you don't have)
npm run test:all        # everything (200 tests)

npm run example            # invoice agent
npm run example:verified   # router brain + verification + auto-repair
npm run example:research   # session memory + file-safe orchestration
npm run example:stack      # full munesoft-stack integration
```

---

## License

MIT © Munesoft
