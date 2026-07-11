"use strict";
const {
  createAgent, createLLM, createBridge, listProviders, listBridges,
  OpenAIAdapter, ClaudeAdapter, GeminiAdapter, VertexAIAdapter,
  AzureOpenAIAdapter, BedrockAdapter, MistralAdapter, CohereAdapter,
  GrokAdapter, PerplexityAdapter, DeepSeekAdapter, QwenAdapter, ERNIEAdapter,
  HuggingFaceAdapter, OllamaAdapter, TogetherAdapter, GroqAdapter,
  FireworksAdapter, OpenRouterAdapter, AI21Adapter, NovitaAdapter,
  LangChainBridge, LangGraphBridge, CrewAIBridge, AutoGenBridge,
  OpenAIAgentsBridge, SwarmBridge, LlamaIndexBridge, SemanticKernelBridge,
  HaystackBridge, MCPBridge, N8NBridge, ZapierBridge, MakeBridge,
  SmolAgentsBridge, AgnoBridge, MetaGPTBridge, FlowiseBridge,
  SuperAGIBridge, AAIFBridge, OpenDevinBridge, AgentGPTBridge, DustBridge,
  Orchestrator, WorkflowBuilder, EventBus, ToolRegistry, BaseLLMAdapter, GuardrailError, UnknownIntentError, LowConfidenceError, OutputValidationError,
} = require("../index");

let passed = 0, failed = 0;
async function test(name, fn) {
  try   { await fn(); passed++; process.stdout.write(`  ✓ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ✗ ${name}\n    → ${e.message}\n`); }
}
const assert      = (c, m)    => { if (!c) throw new Error(m || "assertion failed"); };
const assertEqual = (a, b, m) => { if (a !== b) throw new Error(m || `${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

function clearEnv(...keys) { const saved = {}; keys.forEach(k => { saved[k] = process.env[k]; delete process.env[k]; }); return () => keys.forEach(k => { if (saved[k]) process.env[k] = saved[k]; else delete process.env[k]; }); }

function makeAgent(action, fn) {
  return createAgent({
    tools: [{ name: action, description: action, schema: { input: { type: "string", required: false, default: "" } }, handler: fn }],
    rules: [{ pattern: /.+/, action, extract: m => ({ input: m[0] }), confidence: 0.9 }],
  });
}

// ─── LLM Provider Tests ───────────────────────────────────────────────────────
async function testProviders() {
  console.log("\n🤖 LLM Providers — createLLM factory");
  await test("BaseLLMAdapter honors URL paths and timeouts", async () => {
    const http = require("http");
    const server = http.createServer((req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ path: req.url })); });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const adapter = new BaseLLMAdapter({ requestTimeout: 1000 });
      const address = server.address();
      const result = await adapter._post("http://127.0.0.1:" + address.port + "/api", "/v1/test", {}, { ok: true });
      assertEqual(result.path, "/api/v1/test");
      assertEqual(adapter.requestTimeout, 1000);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });

  // All providers that need API keys
  const keyTests = [
    ["openai",        ["OPENAI_API_KEY"],                             OpenAIAdapter],
    ["claude",        ["ANTHROPIC_API_KEY"],                          ClaudeAdapter],
    ["gemini",        ["GEMINI_API_KEY"],                             GeminiAdapter],
    ["mistral",       ["MISTRAL_API_KEY"],                            MistralAdapter],
    ["cohere",        ["COHERE_API_KEY"],                             CohereAdapter],
    ["grok",          ["XAI_API_KEY"],                                GrokAdapter],
    ["perplexity",    ["PERPLEXITY_API_KEY"],                         PerplexityAdapter],
    ["deepseek",      ["DEEPSEEK_API_KEY"],                           DeepSeekAdapter],
    ["qwen",          ["DASHSCOPE_API_KEY"],                          QwenAdapter],
    ["ernie",         ["BAIDU_API_KEY","BAIDU_SECRET_KEY"],           ERNIEAdapter],
    ["huggingface",   ["HUGGINGFACE_API_KEY"],                        HuggingFaceAdapter],
    ["together",      ["TOGETHER_API_KEY"],                           TogetherAdapter],
    ["groq",          ["GROQ_API_KEY"],                               GroqAdapter],
    ["fireworks",     ["FIREWORKS_API_KEY"],                          FireworksAdapter],
    ["openrouter",    ["OPENROUTER_API_KEY"],                         OpenRouterAdapter],
    ["ai21",          ["AI21_API_KEY"],                               AI21Adapter],
    ["novita",        ["NOVITA_API_KEY"],                             NovitaAdapter],
  ];

  for (const [name, keys, Cls] of keyTests) {
    await test(`${name} throws without key`,    () => { const restore = clearEnv(...keys); let t=false; try { createLLM(name); } catch { t=true; } restore(); assert(t); });
    await test(`${name} instantiates with key`, () => { assert(createLLM(name, keys.reduce((o,k) => ({...o,[k.toLowerCase().replace(/_/g,"")]: "test-key", apiKey: "test-key", secretKey: "test-sec", accessKeyId: "test-key", secretAccessKey: "test-sec"}), {})) instanceof Cls); });
  }

  // Providers that need non-apiKey fields
  await test("vertex throws without projectId",  () => { const r=clearEnv("GOOGLE_CLOUD_PROJECT","GOOGLE_ACCESS_TOKEN"); let t=false; try { createLLM("vertex"); } catch { t=true; } r(); assert(t); });
  await test("vertex instantiates",              () => { assert(createLLM("vertexai", { projectId: "p", accessToken: "t" }) instanceof VertexAIAdapter); });
  await test("azure throws without endpoint",    () => { let t=false; try { createLLM("azure", { apiKey: "k" }); } catch { t=true; } assert(t); });
  await test("azure instantiates",               () => { assert(createLLM("azure", { apiKey: "k", endpoint: "myresource.openai.azure.com", deployment: "gpt4" }) instanceof AzureOpenAIAdapter); });
  await test("bedrock throws without creds",     () => { const r=clearEnv("AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY"); let t=false; try { createLLM("bedrock"); } catch { t=true; } r(); assert(t); });
  await test("bedrock instantiates",             () => { assert(createLLM("bedrock", { accessKeyId: "k", secretAccessKey: "s" }) instanceof BedrockAdapter); });
  await test("ollama instantiates without key",  () => { assert(createLLM("ollama") instanceof OllamaAdapter); });

  // Aliases
  await test("anthropic alias → ClaudeAdapter",  () => { assert(createLLM("anthropic", { apiKey: "k" }) instanceof ClaudeAdapter); });
  await test("google alias → GeminiAdapter",     () => { assert(createLLM("google", { apiKey: "k" }) instanceof GeminiAdapter); });
  await test("google-deepmind alias",            () => { assert(createLLM("google-deepmind", { apiKey: "k" }) instanceof GeminiAdapter); });
  await test("microsoft alias → AzureOpenAI",    () => { assert(createLLM("microsoft", { apiKey: "k", endpoint: "e.openai.azure.com", deployment: "d" }) instanceof AzureOpenAIAdapter); });
  await test("aws alias → BedrockAdapter",       () => { assert(createLLM("aws", { accessKeyId: "k", secretAccessKey: "s" }) instanceof BedrockAdapter); });
  await test("meta alias → BedrockAdapter",      () => { assert(createLLM("meta", { accessKeyId: "k", secretAccessKey: "s" }) instanceof BedrockAdapter); });
  await test("llama alias → BedrockAdapter",     () => { assert(createLLM("llama", { accessKeyId: "k", secretAccessKey: "s" }) instanceof BedrockAdapter); });
  await test("xai alias → GrokAdapter",          () => { assert(createLLM("xai", { apiKey: "k" }) instanceof GrokAdapter); });
  await test("alibaba alias → QwenAdapter",      () => { assert(createLLM("alibaba", { apiKey: "k" }) instanceof QwenAdapter); });
  await test("baidu alias → ERNIEAdapter",       () => { assert(createLLM("baidu", { apiKey: "k", secretKey: "s" }) instanceof ERNIEAdapter); });
  await test("hf alias → HuggingFaceAdapter",    () => { assert(createLLM("hf", { apiKey: "k" }) instanceof HuggingFaceAdapter); });
  await test("local alias → OllamaAdapter",      () => { assert(createLLM("local") instanceof OllamaAdapter); });

  // Custom model
  await test("custom model is respected",        () => { assertEqual(createLLM("openai", { apiKey: "k", model: "gpt-3.5-turbo" }).model, "gpt-3.5-turbo"); });

  // Unknown provider
  await test("throws on unknown provider",       () => { let t=false; try { createLLM("fakellm123"); } catch { t=true; } assert(t); });

  // listProviders
  await test("listProviders returns array",      () => { const p = listProviders(); assert(Array.isArray(p)); assert(p.includes("openai")); assert(p.includes("claude")); assert(p.includes("gemini")); assert(p.length > 20); });

  // _toOpenAIFunctions shared helper
  await test("_toOpenAIFunctions converts schema", () => {
    const a   = createLLM("openai", { apiKey: "k" });
    const fns = a._toOpenAIFunctions([{ name: "greet", description: "say hi", schema: { name: "string", age: "number" } }]);
    assertEqual(fns[0].name, "greet");
    assert(fns[0].parameters.properties.name);
    assert(fns[0].parameters.required.includes("name"));
  });
}

// ─── Bridge Tests ─────────────────────────────────────────────────────────────
async function testBridges() {
  console.log("\n🌉 Framework Bridges — createBridge factory");

  const bridgeTests = [
    ["langchain",       LangChainBridge],
    ["langgraph",       LangGraphBridge],
    ["crewai",          CrewAIBridge],
    ["autogen",         AutoGenBridge],
    ["openai-agents",   OpenAIAgentsBridge],
    ["autogpt",         OpenAIAgentsBridge],
    ["swarm",           SwarmBridge],
    ["llamaindex",      LlamaIndexBridge],
    ["semantic-kernel", SemanticKernelBridge],
    ["haystack",        HaystackBridge],
    ["mcp",             MCPBridge],
    ["n8n",             N8NBridge],
    ["zapier",          ZapierBridge],
    ["make",            MakeBridge],
    ["integromat",      MakeBridge],
    ["smolagents",      SmolAgentsBridge],
    ["agno",            AgnoBridge],
    ["metagpt",         MetaGPTBridge],
    ["flowise",         FlowiseBridge],
    ["superagi",        SuperAGIBridge],
    ["aaif",            AAIFBridge],
    ["opendevin",       OpenDevinBridge],
    ["agentgpt",        AgentGPTBridge],
    ["dust",            DustBridge],
  ];

  for (const [name, Cls] of bridgeTests) {
    await test(`createBridge("${name}") returns correct type`, () => { assert(createBridge(name) instanceof Cls); });
  }

  await test("throws on unknown bridge",        () => { let t=false; try { createBridge("fakework99"); } catch { t=true; } assert(t); });
  await test("listBridges returns array",       () => { const b = listBridges(); assert(Array.isArray(b)); assert(b.includes("langchain")); assert(b.includes("mcp")); assert(b.length > 20); });

  // LangChain bridge — tool export
  await test("LangChain: toTools exports registry", () => {
    const registry = new ToolRegistry();
    registry.register({ name: "send_email", description: "Send email", schema: { to: "string" }, handler: async () => ({}) });
    const bridge = createBridge("langchain");
    const tools  = bridge.toTools(registry);
    assertEqual(tools.length, 1);
    assertEqual(tools[0].name, "send_email");
    assert(typeof tools[0].func === "function");
  });

  await test("LangChain: fromMunesoftAgent wraps agent as tool", () => {
    const agent  = makeAgent("test_act", () => ({ done: true }));
    const bridge = createBridge("langchain");
    const tool   = bridge.fromMunesoftAgent(agent, "my_agent", "My agent");
    assert(typeof tool.func === "function");
    assertEqual(tool.name, "my_agent");
  });

  // LangGraph bridge
  await test("LangGraph: toNode wraps agent as graph node", async () => {
    const agent  = makeAgent("lg_act", ({ input }) => ({ result: input }));
    const bridge = createBridge("langgraph");
    const node   = bridge.toNode(agent);
    assert(typeof node === "function");
    const state  = await node({ messages: [{ role: "human", content: "hello" }] });
    assert(Array.isArray(state.messages));
    assert(state.messages.length > 1);
  });

  await test("LangGraph: fromGraph wraps graph as tool", () => {
    const mockGraph = { invoke: async (s) => ({ messages: [{ role: "ai", content: "result" }] }) };
    const bridge    = createBridge("langgraph");
    const tool      = bridge.fromGraph(mockGraph, "search_graph", "Run search");
    assert(typeof tool.handler === "function");
  });

  // CrewAI bridge
  await test("CrewAI: toCrewTools converts registry", () => {
    const r = new ToolRegistry();
    r.register({ name: "analyze", description: "Analyze", schema: { data: "string" }, handler: async () => ({}) });
    const bridge = createBridge("crewai");
    const tools  = bridge.toCrewTools(r);
    assertEqual(tools[0].name, "analyze");
    assert(typeof tools[0].run === "function");
  });

  await test("CrewAI: toCrewAgent wraps Munesoft agent", () => {
    const agent  = makeAgent("crew_act", () => ({}));
    const bridge = createBridge("crewai");
    const crew   = bridge.toCrewAgent(agent, { role: "Analyst" });
    assertEqual(crew.role, "Analyst");
    assert(typeof crew.execute_task === "function");
  });

  // AutoGen bridge
  await test("AutoGen: toFunctionMap generates callable map", () => {
    const r = new ToolRegistry();
    r.register({ name: "calc", description: "Calculate", schema: { x: "number" }, handler: async ({ x }) => ({ result: x * 2 }) });
    const bridge = createBridge("autogen");
    const map    = bridge.toFunctionMap(r);
    assert(typeof map.calc === "function");
  });

  await test("AutoGen: toToolSchemas generates OpenAI-format schemas", () => {
    const r = new ToolRegistry();
    r.register({ name: "greet", description: "Greet", schema: { name: "string" }, handler: async () => ({}) });
    const bridge   = createBridge("autogen");
    const schemas  = bridge.toToolSchemas(r);
    assertEqual(schemas[0].type, "function");
    assertEqual(schemas[0].function.name, "greet");
  });

  // OpenAI Agents SDK bridge
  await test("OpenAI Agents SDK: toTools exports correctly", () => {
    const r = new ToolRegistry();
    r.register({ name: "lookup", description: "Look up data", schema: { query: "string" }, handler: async () => ({}) });
    const bridge = createBridge("openai-agents");
    const tools  = bridge.toTools(r);
    assertEqual(tools[0].name, "lookup");
    assert(typeof tools[0].execute === "function");
  });

  // Swarm bridge
  await test("Swarm: toSwarmAgent exports agent definition", () => {
    const agent  = makeAgent("sw_act", () => ({}));
    const bridge = createBridge("swarm");
    const swarm  = bridge.toSwarmAgent(agent, { name: "SwarmBot" });
    assertEqual(swarm.name, "SwarmBot");
    assert(Array.isArray(swarm.functions));
  });

  // LlamaIndex bridge
  await test("LlamaIndex: toTools exports registry", () => {
    const r = new ToolRegistry();
    r.register({ name: "search", description: "Search docs", schema: { query: "string" }, handler: async () => ({}) });
    const bridge = createBridge("llamaindex");
    const tools  = bridge.toTools(r);
    assertEqual(tools[0].metadata.name, "search");
    assert(typeof tools[0].call === "function");
  });

  // Semantic Kernel bridge
  await test("SemanticKernel: toKernelFunctions exports correctly", () => {
    const r = new ToolRegistry();
    r.register({ name: "summarize", description: "Summarize text", schema: { text: "string" }, handler: async () => ({}) });
    const bridge = createBridge("semantic-kernel");
    const fns    = bridge.toKernelFunctions(r);
    assertEqual(fns[0].name, "summarize");
    assert(Array.isArray(fns[0].parameters));
    assert(typeof fns[0].invoke === "function");
  });

  // Haystack bridge
  await test("Haystack: toComponents exports correctly", () => {
    const r = new ToolRegistry();
    r.register({ name: "retrieve", description: "Retrieve docs", schema: { query: "string" }, handler: async () => ({}) });
    const bridge = createBridge("haystack");
    const comps  = bridge.toComponents(r);
    assertEqual(comps[0].name, "retrieve");
    assert(typeof comps[0].run === "function");
  });

  // MCP bridge
  await test("MCP: toMCPTools generates correct schema", () => {
    const r = new ToolRegistry();
    r.register({ name: "get_weather", description: "Get weather", schema: { city: "string" }, handler: async () => ({}) });
    const bridge = createBridge("mcp");
    const result = bridge.toMCPTools(r);
    assertEqual(result.tools[0].name, "get_weather");
    assert(result.tools[0].inputSchema.properties.city);
  });

  await test("MCP: createServerHandler handles listTools", async () => {
    const r = new ToolRegistry();
    r.register({ name: "ping", description: "Ping", schema: {}, handler: async () => ({ pong: true }) });
    const bridge  = createBridge("mcp");
    const handler = bridge.createServerHandler(r);
    const list    = await handler.listTools();
    assertEqual(list.tools[0].name, "ping");
  });

  await test("MCP: createServerHandler handles callTool", async () => {
    const r = new ToolRegistry();
    r.register({ name: "echo_mcp", description: "Echo", schema: { msg: "string" }, handler: async ({ msg }) => ({ echo: msg }) });
    const bridge  = createBridge("mcp");
    const handler = bridge.createServerHandler(r);
    const result  = await handler.callTool({ name: "echo_mcp", arguments: { msg: "hello" } });
    assert(!result.isError);
    assert(result.content[0].text.includes("hello"));
  });

  await test("MCP: importFromServer registers tools", async () => {
    const r      = new ToolRegistry();
    const bridge = createBridge("mcp");
    const mockClient = {
      listTools: async () => ({ tools: [{ name: "remote_search", description: "Search remotely", inputSchema: { properties: { q: { type: "string" } }, required: ["q"] } }] }),
      callTool:  async ({ name, arguments: args }) => ({ content: [{ text: JSON.stringify({ results: [] }) }] }),
    };
    await bridge.importFromServer(mockClient, r);
    assert(r.has("remote_search"));
    assert(r.get("remote_search").options.tags.includes("mcp"));
  });

  // SmolAgents bridge
  await test("SmolAgents: toTools exports correctly", () => {
    const r = new ToolRegistry();
    r.register({ name: "classify", description: "Classify text", schema: { text: "string" }, handler: async () => ({}) });
    const bridge = createBridge("smolagents");
    const tools  = bridge.toTools(r);
    assertEqual(tools[0].name, "classify");
    assert(typeof tools[0].forward === "function");
  });

  // Agno bridge
  await test("Agno: toTools exports correctly", () => {
    const r = new ToolRegistry();
    r.register({ name: "plan", description: "Make a plan", schema: { goal: "string" }, handler: async () => ({}) });
    const bridge = createBridge("agno");
    const tools  = bridge.toTools(r);
    assertEqual(tools[0].name, "plan");
    assert(typeof tools[0].entrypoint === "function");
  });

  // AAIF bridge
  await test("AAIF: toAgentCard generates valid card", () => {
    const agent  = makeAgent("aaif_act", () => ({}));
    const bridge = createBridge("aaif");
    const card   = bridge.toAgentCard(agent, { name: "TestAgent", version: "1.0" });
    assertEqual(card.schemaVersion, "1.0");
    assertEqual(card.name, "TestAgent");
    assert(Array.isArray(card.skills));
    assert(card.capabilities.functionCalling);
    assert(card.capabilities.multiAgent);
  });

  // n8n bridge
  await test("n8n: webhookTool creates valid tool def", () => {
    const bridge = createBridge("n8n", { webhookUrl: "https://n8n.example.com/webhook/test" });
    const tool   = bridge.webhookTool("trigger_flow", "Trigger n8n flow", "https://n8n.example.com/webhook/test");
    assertEqual(tool.name, "trigger_flow");
    assert(typeof tool.handler === "function");
    assert(tool.options.tags.includes("n8n"));
  });

  // Zapier bridge
  await test("Zapier: nlaTool creates valid tool def", () => {
    const bridge = createBridge("zapier", { nlaApiKey: "test" });
    const tool   = bridge.nlaTool("send_email_zap", "Send email via Zapier", "action_123");
    assertEqual(tool.name, "send_email_zap");
    assert(typeof tool.handler === "function");
    assert(tool.options.tags.includes("zapier"));
  });

  // Make bridge
  await test("Make: webhookTool creates valid tool def", () => {
    const bridge = createBridge("make");
    const tool   = bridge.webhookTool("trigger_scenario", "Trigger Make scenario", "https://hook.make.com/abc123");
    assertEqual(tool.name, "trigger_scenario");
    assert(typeof tool.handler === "function");
    assert(tool.options.tags.includes("make"));
  });

  // OpenDevin bridge
  await test("OpenDevin: toTools exports correctly", () => {
    const r = new ToolRegistry();
    r.register({ name: "run_code", description: "Run code", schema: { code: "string" }, handler: async () => ({}) });
    const bridge = createBridge("opendevin");
    const tools  = bridge.toTools(r);
    assert(tools[0].function.name === "run_code");
    assert(typeof tools[0].execute === "function");
  });

  // MetaGPT bridge
  await test("MetaGPT: toAction wraps tool", () => {
    const r = new ToolRegistry();
    r.register({ name: "write_code", description: "Write code", schema: { spec: "string" }, handler: async () => ({}) });
    const bridge = createBridge("metagpt");
    const action = bridge.toAction(r.get("write_code"));
    assertEqual(action.name, "write_code");
    assert(typeof action.run === "function");
  });

  // AgentGPT bridge
  await test("AgentGPT: toTasks exports registry", () => {
    const r = new ToolRegistry();
    r.register({ name: "research", description: "Research a topic", schema: { topic: "string" }, handler: async () => ({}) });
    const bridge = createBridge("agentgpt");
    const tasks  = bridge.toTasks(r);
    assertEqual(tasks[0].tool, "research");
    assert(typeof tasks[0].execute === "function");
  });

  // SuperAGI bridge
  await test("SuperAGI: toToolkitTools exports correctly", () => {
    const r = new ToolRegistry();
    r.register({ name: "browse_web", description: "Browse the web", schema: { url: "string" }, handler: async () => ({}) });
    const bridge = createBridge("superagi");
    const tools  = bridge.toToolkitTools(r);
    assertEqual(tools[0].name, "browse_web");
    assert(typeof tools[0].execute === "function");
  });
}

// ─── Event Bus Tests ──────────────────────────────────────────────────────────
async function testEvents() {
  console.log("\n📡 Event Bus");
  await test("on/emit works",             () => { const b = new EventBus(); let x=0; b.on("t", () => x++); b.emit("t"); assert(x===1); });
  await test("wildcard * receives all",   () => { const b = new EventBus(); const got=[]; b.on("*", e => got.push(e.event)); b.emit("a"); b.emit("b"); assertEqual(got.length, 2); });
  await test("once fires only once",      () => { const b = new EventBus(); let n=0; b.once("x", () => n++); b.emit("x"); b.emit("x"); assertEqual(n, 1); });
  await test("off removes handler",       () => { const b = new EventBus(); let n=0; const h = () => n++; b.on("y", h); b.off("y", h); b.emit("y"); assertEqual(n, 0); });
  await test("unsubscribe fn returned",   () => { const b = new EventBus(); let n=0; const u = b.on("z", () => n++); u(); b.emit("z"); assertEqual(n, 0); });
  await test("history records events",    () => { const b = new EventBus(); b.emit("ev", { x: 1 }); b.emit("ev", { x: 2 }); assertEqual(b.history("ev").length, 2); });
  await test("history filtered by event", () => { const b = new EventBus(); b.emit("a"); b.emit("b"); b.emit("a"); assertEqual(b.history("a").length, 2); });
  await test("respects maxHistory",         () => { const b = new EventBus({ maxHistory: 2 }); b.emit("a"); b.emit("b"); b.emit("c"); assertEqual(b.history().length, 2); assertEqual(b.history()[0].event, "b"); });
  await test("once is safe under re-entry", () => { const b = new EventBus(); let n = 0; b.once("x", () => { n++; b.emit("x"); }); b.emit("x"); assertEqual(n, 1); });
  await test("exports specific guardrail errors", () => { assert(new UnknownIntentError("x") instanceof GuardrailError); assert(new LowConfidenceError("x") instanceof GuardrailError); assert(new OutputValidationError("x") instanceof GuardrailError); });
}

// ─── Orchestrator Tests ───────────────────────────────────────────────────────
async function testOrchestrator() {
  console.log("\n🎭 Orchestrator");
  await test("registers agent",            () => { const o = new Orchestrator(); o.register("a", makeAgent("a_act", () => ({}))); assert(o.has("a")); });
  await test("prevents duplicate",         () => { const o = new Orchestrator(); const a = makeAgent("a2", () => {}); o.register("d", a); let t=false; try { o.register("d", a); } catch { t=true; } assert(t); });
  await test("runs agent by name",         async () => { const o = new Orchestrator(); o.register("e", makeAgent("echo_act2", ({ input }) => ({ echoed: input }))); const r = await o.run("e", "hi"); assert(r.success); });
  await test("pipeline in sequence",       async () => { const o = new Orchestrator(); const seq=[]; o.register("s1", makeAgent("s1b", () => { seq.push(1); return { n:1 }; })); o.register("s2", makeAgent("s2b", () => { seq.push(2); return { n:2 }; })); const r = await o.pipeline([{ agent:"s1",input:"go" },{ agent:"s2",input:"go" }]); assert(r.success); assertEqual(seq.join(","),"1,2"); });
  await test("pipeline stops on failure",  async () => { const o = new Orchestrator(); o.register("ok2", makeAgent("ok2a", () => ({ ok:true }))); o.register("fail", createAgent({ tools:[{ name:"fa", description:"f", schema:{}, handler: async () => { throw new Error("X"); } }], rules:[{ pattern:/.+/, action:"fa", extract:()=>({}), confidence:0.9 }] })); const r = await o.pipeline([{ agent:"ok2",input:"ok" },{ agent:"fail",input:"x" }]); assert(!r.success); assertEqual(r.stoppedAt, 1); });
  await test("parallel runs all",          async () => { const o = new Orchestrator(); o.register("p1b", makeAgent("p1b_act", () => ({ n:1 }))); o.register("p2b", makeAgent("p2b_act", () => ({ n:2 }))); const r = await o.parallel([{ agent:"p1b",input:"go" },{ agent:"p2b",input:"go" }]); assert(r.success); assertEqual(r.outputs.length, 2); });
  await test("route via selector",         async () => { const o = new Orchestrator(); o.register("an2", makeAgent("an2a", () => ({ type:"analysis" }))); o.register("wr2", makeAgent("wr2a", () => ({ type:"writing" }))); const r = await o.route("analyze", i => i.includes("analyze") ? "an2" : "wr2"); assert(r.success); assertEqual(r.output.type, "analysis"); });
  await test("llmRoute with mock",         async () => { const o = new Orchestrator(); o.register("ra2", makeAgent("ra2a", () => ({ done:true }))); const r = await o.llmRoute("do it", { complete: async () => "ra2" }, { ra2:"does tasks" }); assert(r.success); });
  await test("enableHandoff adds tool",    () => { const o = new Orchestrator(); const a = makeAgent("haa", () => {}); const b = makeAgent("hba", () => {}); o.register("ha2", a); o.register("hb2", b); o.enableHandoff("ha2", ["hb2"]); assert(a.registry.has("handoff_to_hb2")); });
}

// ─── Workflow Tests ───────────────────────────────────────────────────────────
async function testWorkflow() {
  console.log("\n🔧 Workflow Builder");
  await test("builds minimal workflow",    () => { const w = new WorkflowBuilder({ name:"T" }).start("s").end("e").connect("s","e").build(); assert(w.name === "T"); });
  await test("throws without start",       () => { let t=false; try { new WorkflowBuilder().end("e").build(); } catch { t=true; } assert(t); });
  await test("throws without end",         () => { let t=false; try { new WorkflowBuilder().start("s").agent("a",{ agent:"x", input:"y" }).connect("s","a").build(); } catch { t=true; } assert(t); });
  await test("toJSON exports structure",   () => { const j = new WorkflowBuilder({ name:"X" }).start("s").end("e").connect("s","e").toJSON(); assert(Array.isArray(j.nodes)); assert(Array.isArray(j.edges)); });
  await test("fromJSON imports",           () => { const b = new WorkflowBuilder({ name:"RT" }).start("s").end("e").connect("s","e"); const i = WorkflowBuilder.fromJSON(b.toJSON()); assertEqual(i.name, "RT"); });
  await test("agent node runs",            async () => { const o = new Orchestrator(); o.register("gr2", makeAgent("gr2a", () => ({ done:true }))); const w = new WorkflowBuilder({ name:"A" }).start("s").agent("g",{ agent:"gr2",input:"hi" }).end("e").connect("s","g").connect("g","e").build(); const r = await w.execute(o); assert(r.success); assert(r.context.g_output?.done); });
  await test("condition branches",         async () => { const o = new Orchestrator(); o.register("tb3", makeAgent("tb3a", () => ({ branch:"true" }))); o.register("fb3", makeAgent("fb3a", () => ({ branch:"false" }))); const w = new WorkflowBuilder({ name:"C" }).start("s").condition("c",{ condition: ctx => ctx.v > 5, onTrue:"t", onFalse:"f" }).agent("t",{ agent:"tb3",input:"go" }).agent("f",{ agent:"fb3",input:"go" }).end("e").connect("s","c").connect("t","e").connect("f","e").build(); const rt = await w.execute(o, { v:10 }); assert(rt.success); assertEqual(rt.context.t_output?.branch,"true"); });
  await test("transform modifies context", async () => { const o = new Orchestrator(); const w = new WorkflowBuilder({ name:"TR" }).start("s").transform("t", ctx => ({ ...ctx, doubled:(ctx.v||1)*2 })).end("e").connect("s","t").connect("t","e").build(); const r = await w.execute(o, { v:5 }); assert(r.success); assertEqual(r.context.doubled, 10); });
  await test("parallel node works",        async () => { const o = new Orchestrator(); o.register("pb1", makeAgent("pb1a", () => ({ n:"a" }))); o.register("pb2", makeAgent("pb2a", () => ({ n:"b" }))); const w = new WorkflowBuilder({ name:"PAR" }).start("s").parallel("p",[{ agent:"pb1",input:"go" },{ agent:"pb2",input:"go" }]).end("e").connect("s","p").connect("p","e").build(); const r = await w.execute(o); assert(r.success); assert(Array.isArray(r.context.p_output)); });
  await test("diagram() produces text",    () => { const w = new WorkflowBuilder({ name:"DG" }).start("s").end("e").connect("s","e").build(); const d = w.diagram(); assert(d.includes("START")); assert(d.includes("END")); });
}

async function main() {
  console.log("\n🧪 @munesoft/agent — v2 Extended Test Suite\n" + "=".repeat(56));
  await testProviders();
  await testBridges();
  await testEvents();
  await testOrchestrator();
  await testWorkflow();
  console.log(`\n${"=".repeat(56)}\n✅ Passed: ${passed}  ❌ Failed: ${failed}  Total: ${passed+failed}`);
  if (failed) process.exit(1);
  else console.log("🎉 All v2 tests passed!\n");
}
main().catch(e => { console.error(e); process.exit(1); });
