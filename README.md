# @munesoft/agent

> **Build reliable AI agents in minutes.**
> The Express.js for AI agents — modular, typed, production-ready.

![version](https://img.shields.io/badge/version-2.0.0-teal)
![tests](https://img.shields.io/badge/tests-183%20passing-brightgreen)
![dependencies](https://img.shields.io/badge/dependencies-0-blue)
![license](https://img.shields.io/badge/license-MIT-orange)

---

## What is Munesoft Agent Framework?

Infrastructure for **real AI agents** — not chatbot wrappers. The most adaptable AI agent framework available:

- **21 LLM providers** — every major model with native function/tool calling
- **23 framework bridges** — plug into any AI ecosystem bidirectionally
- **Multi-agent orchestration** — pipelines, parallel, routing, handoff
- **Visual workflow builder** — node graphs with conditions, branches, transforms
- **Event system** — subscribe to every stage of the agent lifecycle
- **Streaming** — real-time stage-by-stage output for live UIs
- **Zero dependencies** — pure Node.js

```js
import { createAgent, createLLM } from "@munesoft/agent";

const llm   = createLLM("claude", { apiKey: process.env.ANTHROPIC_API_KEY });
const agent = createAgent({ tools, llmProvider: llm });

const result = await agent.run("Send invoice to John for $200");
// → { success: true, tool: "send_invoice", output: { invoiceId: "INV-1001" } }
```

---

## Install

```bash
npm install @munesoft/agent
```

---

## LLM Providers

Every major provider. Same interface. Native function calling on all.

```js
import { createLLM } from "@munesoft/agent";

// Pick any provider — the API never changes
const llm = createLLM("openai",      { apiKey: process.env.OPENAI_API_KEY });
const llm = createLLM("claude",      { apiKey: process.env.ANTHROPIC_API_KEY });
const llm = createLLM("gemini",      { apiKey: process.env.GEMINI_API_KEY });
const llm = createLLM("grok",        { apiKey: process.env.XAI_API_KEY });
const llm = createLLM("deepseek",    { apiKey: process.env.DEEPSEEK_API_KEY });
const llm = createLLM("groq",        { apiKey: process.env.GROQ_API_KEY });
const llm = createLLM("mistral",     { apiKey: process.env.MISTRAL_API_KEY });
const llm = createLLM("cohere",      { apiKey: process.env.COHERE_API_KEY });
const llm = createLLM("perplexity",  { apiKey: process.env.PERPLEXITY_API_KEY });
const llm = createLLM("ollama",      { model: "llama3.2" });                           // local
const llm = createLLM("openrouter",  { apiKey: "...", model: "anthropic/claude-3.5-sonnet" }); // any model
```

| Provider | Key | Function Calling | Notes |
|----------|-----|:-:|-------|
| **OpenAI** | `openai` / `gpt` | ✅ | Includes o1, o3 series |
| **Anthropic Claude** | `claude` / `anthropic` | ✅ | claude-3.5-sonnet default |
| **Google Gemini** | `gemini` / `google` / `google-deepmind` | ✅ | gemini-1.5-flash default |
| **Google Vertex AI** | `vertex` / `vertexai` | ✅ | Requires projectId + token |
| **Microsoft Azure OpenAI** | `azure` / `microsoft` | ✅ | Requires endpoint + deployment |
| **AWS Bedrock** | `bedrock` / `aws` | ✅ | Claude, LLaMA, Mistral, Nova |
| **Meta AI (LLaMA)** | `meta` / `llama` | ✅ | Via AWS Bedrock |
| **Mistral AI** | `mistral` | ✅ | mistral-large-latest default |
| **Cohere** | `cohere` | ✅ | command-r-plus default |
| **xAI Grok** | `grok` / `xai` | ✅ | grok-2-latest default |
| **Perplexity AI** | `perplexity` | ✅ | Online models supported |
| **DeepSeek** | `deepseek` | ✅ | deepseek-chat default |
| **Alibaba Qwen** | `qwen` / `alibaba` | ✅ | Via DashScope API |
| **Baidu ERNIE** | `ernie` / `baidu` | ✅ | Auto token refresh |
| **Hugging Face** | `huggingface` / `hf` | ✅ | Any HF Inference model |
| **Ollama (local)** | `ollama` / `local` | ✅ | llama3.2 default |
| **Together AI** | `together` | ✅ | LLaMA, Mistral, Qwen |
| **Groq** | `groq` | ✅ | llama-3.3-70b default |
| **Fireworks AI** | `fireworks` | ✅ | LLaMA-3.1-70B default |
| **OpenRouter** | `openrouter` | ✅ | Routes to any model |
| **AI21 Labs** | `ai21` / `jamba` | ✅ | Jamba-1.5-large default |
| **NovitaAI** | `novita` | ✅ | LLaMA-3.1-70B default |

```js
// List all supported providers
import { listProviders } from "@munesoft/agent";
listProviders(); // ["ai21", "alibaba", "anthropic", "aws", ...]
```

---

## Framework Bridges

Plug Munesoft into any AI ecosystem — bidirectionally. Use Munesoft tools inside other frameworks, or wrap external frameworks as Munesoft tools.

```js
import { createBridge } from "@munesoft/agent";

const bridge = createBridge("langchain");
const bridge = createBridge("mcp");
const bridge = createBridge("crewai");
const bridge = createBridge("n8n", { webhookUrl: "..." });
```

### Agent Frameworks

| Framework | Key | Export tools | Import as tool | Agent wrapping |
|-----------|-----|:-:|:-:|:-:|
| **LangChain** | `langchain` | ✅ | ✅ | ✅ |
| **LangGraph** | `langgraph` | ✅ | ✅ | ✅ |
| **CrewAI** | `crewai` | ✅ | ✅ | ✅ |
| **Microsoft AutoGen** | `autogen` | ✅ | ✅ | ✅ |
| **OpenAI Agents SDK** | `openai-agents` | ✅ | ✅ | ✅ |
| **AutoGPT** | `autogpt` | ✅ | — | ✅ |
| **OpenAI Swarm** | `swarm` | ✅ | ✅ | ✅ |
| **LlamaIndex** | `llamaindex` | ✅ | ✅ | ✅ |
| **Semantic Kernel** | `semantic-kernel` / `sk` | ✅ | ✅ | ✅ |
| **Haystack** | `haystack` | ✅ | ✅ | — |
| **SmolAgents** | `smolagents` | ✅ | ✅ | — |
| **Agno** | `agno` | ✅ | ✅ | — |
| **MetaGPT** | `metagpt` | ✅ | ✅ | — |
| **SuperAGI** | `superagi` | ✅ | — | — |
| **AgentGPT** | `agentgpt` | ✅ | — | — |
| **OpenDevin** | `opendevin` / `all-hands` | ✅ | — | — |
| **Flowise** | `flowise` | — | ✅ | — |
| **Dust** | `dust` | — | ✅ | — |

### Protocols & Standards

| Standard | Key | Notes |
|----------|-----|-------|
| **Model Context Protocol (MCP)** | `mcp` | Full server + client, auto-import from any MCP server |
| **Linux Foundation AAIF** | `aaif` | Agent Card generation, remote agent wrapping |

### Automation Platforms

| Platform | Key | Notes |
|----------|-----|-------|
| **n8n** | `n8n` | Webhook tool, node export |
| **Zapier** | `zapier` | NLA actions, auto-import |
| **Make (Integromat)** | `make` / `integromat` | Webhook tool |

```js
// List all bridges
import { listBridges } from "@munesoft/agent";
listBridges(); // ["aaif", "agentgpt", "agno", "autogen", "autogpt", ...]
```

### Bridge Examples

```js
// LangChain — use Munesoft tools inside LangChain
const bridge = createBridge("langchain");
const tools  = bridge.toTools(agent.registry);  // → DynamicStructuredTool[]
// Use in: new AgentExecutor({ tools, agent: createOpenAIFunctionsAgent(...) })

// LangGraph — Munesoft agent as a graph node
const bridge = createBridge("langgraph");
graph.addNode("invoice_agent", bridge.toNode(invoiceAgent));

// CrewAI — Munesoft agent as a crew member
const bridge = createBridge("crewai");
const crewAgent = bridge.toCrewAgent(agent, { role: "Billing Specialist" });

// MCP — serve Munesoft tools as an MCP server
const bridge  = createBridge("mcp");
const handler = bridge.createServerHandler(agent.registry);
// handler.listTools() / handler.callTool({ name, arguments })

// MCP — consume an MCP server's tools into Munesoft
await bridge.importFromServer(mcpClient, agent.registry);
// Now all MCP server tools are callable as Munesoft tools

// AAIF — publish agent as a discoverable agent card
const bridge = createBridge("aaif");
const card   = bridge.toAgentCard(agent, { name: "Invoice Agent", version: "1.10.10" });

// n8n — trigger a workflow from an agent tool
const bridge = createBridge("n8n");
agent.addTool(bridge.webhookTool("notify_team", "Notify team via n8n", "https://n8n.myco.com/webhook/abc"));

// Zapier — auto-import all NLA actions as tools
const bridge = createBridge("zapier", { nlaApiKey: process.env.ZAPIER_NLA_API_KEY });
await bridge.importActions(agent.registry);
```

---

## Multi-Agent Orchestration

```js
import { Orchestrator } from "@munesoft/agent";

const orch = new Orchestrator();
orch.register("research", researchAgent)
    .register("summary",  summaryAgent)
    .register("email",    emailAgent);

// Sequential pipeline
const result = await orch.pipeline([
  { agent: "research", input: "research AI trends", label: "Research" },
  { agent: "summary",  input: (prev) => `summarize: ${JSON.stringify(prev.output)}` },
  { agent: "email",    input: () => "send to ceo@company.com" },
]);

// Parallel execution
const result = await orch.parallel([
  { agent: "analyst", input: "analyze fintech" },
  { agent: "analyst", input: "analyze healthtech" },
  { agent: "analyst", input: "analyze cleantech" },
]);

// Function-based routing
const result = await orch.route(input, (input, agents) =>
  input.includes("analyze") ? "analyst" : "research"
);

// LLM-based routing
const result = await orch.llmRoute(input, llm, {
  research: "Research and find information",
  analyst:  "Analyze data and recommend",
});

// Agent handoff
orch.enableHandoff("research", ["analyst"]); // research can now delegate to analyst
```

---

## Visual Workflow Builder

```js
import { WorkflowBuilder } from "@munesoft/agent";

const workflow = new WorkflowBuilder({ name: "Support Ticket Flow" })
  .start("start")
  .agent("triage",    { agent: "triage",  input: (ctx) => ctx.issue })
  .condition("check", {
    condition: (ctx) => ctx.triage_output?.priority === "high",
    onTrue: "escalate", onFalse: "queue",
  })
  .agent("escalate",  { agent: "urgent",  input: (ctx) => ctx.triage_output?.ticketId })
  .agent("queue",     { agent: "normal",  input: (ctx) => ctx.triage_output?.ticketId })
  .transform("enrich", (ctx) => ({ ...ctx, processedAt: new Date().toISOString() }))
  .agent("notify",    { agent: "notify",  input: (ctx) => ctx.triage_output?.ticketId })
  .log("audit",       (ctx) => `Completed ${ctx.triage_output?.ticketId}`)
  .end("end")
  .connect("start","triage").connect("triage","check")
  .connect("escalate","enrich").connect("queue","enrich")
  .connect("enrich","notify").connect("notify","audit").connect("audit","end")
  .build();

const result = await workflow.execute(orchestrator, { issue: "server is down URGENT" });

console.log(workflow.diagram());  // text-based diagram
const json = workflow.toJSON();   // export for visual editor
```

---

## Core API

### createAgent

```ts
createAgent({
  tools:               ToolDefinition[];
  rules?:              IntentRule[];
  llmProvider?:        LLMAdapter;
  memory?:             MemoryConfig;
  guardrails?:         GuardrailsConfig | false;
  events?:             EventBus;
  execution?:          { timeout?: number; retries?: number };
  useFunctionCalling?: boolean;
  debug?:              boolean;
}): Agent
```

### Streaming

```js
await agent.stream("Send invoice to John for $200", (stage, data) => {
  if (stage === "intent")   console.log("Action:", data.intent.action);
  if (stage === "executed") console.log("Output:", data.output);
  if (stage === "done")     console.log("Done in", data.response.duration, "ms");
});
```

### Events

```js
agent.events.on("intent.parsed",  ({ intent }) => {});
agent.events.on("tool.executed",  ({ tool, success, duration }) => {});
agent.events.on("agent.error",    ({ error }) => {});
agent.events.on("*",              ({ event, ...data }) => {}); // all events
```

---

## Project Structure

```
@munesoft/agent/
├── index.js
├── packages/
│   ├── core/                  # Agent + Execution Engine
│   ├── intent/                # Intent Parser
│   ├── router/                # Action Router
│   ├── memory/                # Memory + Adapters
│   ├── guardrails/            # Validation + Safety
│   ├── tools/                 # Tool Registry
│   ├── events/                # Event Bus
│   ├── orchestrator/          # Multi-Agent Orchestrator
│   ├── workflow/              # Visual Workflow Builder
│   └── llm/
│       ├── index.js           # Factory: createLLM, createBridge
│       ├── base.js            # BaseLLMAdapter
│       ├── providers/         # 21 LLM provider adapters
│       └── bridges/           # 23 framework bridges
├── examples/
│   ├── invoice-agent.js
│   ├── support-agent.js
│   ├── multi-agent.js
│   └── workflow.js
└── tests/
    ├── run-all.js             # Core suite  (47 tests)
    └── run-v2.js              # v2 suite   (136 tests)
```

---

## Testing

```bash
npm test           # All 183 tests
npm run test:core  # Core suite (47)
npm run test:v2    # v2 suite (136)
```

---

## License

MIT © Munesoft
