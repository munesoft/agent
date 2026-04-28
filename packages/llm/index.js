"use strict";

/**
 * @munesoft/agent — Universal LLM & Framework Adapter
 *
 * LLM PROVIDERS (21):
 *   OpenAI · Anthropic Claude · Google Gemini · Google Vertex AI
 *   Microsoft Azure OpenAI · AWS Bedrock · Mistral AI · Cohere
 *   xAI Grok · Perplexity AI · DeepSeek · Alibaba Qwen · Baidu ERNIE
 *   Hugging Face · Ollama (local) · Together AI · Groq · Fireworks AI
 *   OpenRouter · AI21 Labs · NovitaAI
 *   + Any OpenAI-compatible endpoint via OpenAIAdapter({ baseURL })
 *
 * FRAMEWORK BRIDGES (23):
 *   LangChain · LangGraph · CrewAI · Microsoft AutoGen
 *   OpenAI Agents SDK · OpenAI Swarm · LlamaIndex · Semantic Kernel
 *   Haystack · Flowise · Dust · AgentGPT · OpenDevin · SuperAGI
 *   MetaGPT · SmolAgents · Agno · Linux Foundation AAIF
 *   Model Context Protocol (MCP) · n8n · Zapier · Make · AutoGPT
 */

const { BaseLLMAdapter, LLMError, LLMConfigError } = require("./base");

const {
  OpenAIAdapter, ClaudeAdapter, GeminiAdapter, VertexAIAdapter,
  AzureOpenAIAdapter, BedrockAdapter, MistralAdapter, CohereAdapter,
  GrokAdapter, PerplexityAdapter, DeepSeekAdapter, QwenAdapter, ERNIEAdapter,
  HuggingFaceAdapter, OllamaAdapter, TogetherAdapter, GroqAdapter,
  FireworksAdapter, OpenRouterAdapter, AI21Adapter, NovitaAdapter,
} = require("./providers");

const {
  LangChainBridge, LangGraphBridge, CrewAIBridge, AutoGenBridge,
  OpenAIAgentsBridge, SwarmBridge, LlamaIndexBridge, SemanticKernelBridge,
  HaystackBridge, MCPBridge, N8NBridge, ZapierBridge, MakeBridge,
  SmolAgentsBridge, AgnoBridge, MetaGPTBridge, FlowiseBridge,
  SuperAGIBridge, AAIFBridge, OpenDevinBridge, AgentGPTBridge, DustBridge,
} = require("./bridges");

// ── Provider map ──────────────────────────────────────────────────────────────

const PROVIDERS = {
  "openai": OpenAIAdapter, "gpt": OpenAIAdapter,
  "claude": ClaudeAdapter, "anthropic": ClaudeAdapter,
  "gemini": GeminiAdapter, "google": GeminiAdapter, "google-deepmind": GeminiAdapter, "deepmind": GeminiAdapter,
  "vertex": VertexAIAdapter, "vertexai": VertexAIAdapter, "google-vertex": VertexAIAdapter,
  "azure": AzureOpenAIAdapter, "azure-openai": AzureOpenAIAdapter, "microsoft": AzureOpenAIAdapter,
  "bedrock": BedrockAdapter, "aws": BedrockAdapter, "aws-bedrock": BedrockAdapter,
  "meta": BedrockAdapter, "llama": BedrockAdapter, "meta-ai": BedrockAdapter,
  "mistral": MistralAdapter, "mistral-ai": MistralAdapter,
  "cohere": CohereAdapter,
  "grok": GrokAdapter, "xai": GrokAdapter, "x-ai": GrokAdapter,
  "perplexity": PerplexityAdapter, "perplexity-ai": PerplexityAdapter,
  "deepseek": DeepSeekAdapter, "deep-seek": DeepSeekAdapter,
  "qwen": QwenAdapter, "alibaba": QwenAdapter, "alibaba-cloud": QwenAdapter, "dashscope": QwenAdapter,
  "ernie": ERNIEAdapter, "baidu": ERNIEAdapter, "wenxin": ERNIEAdapter,
  "huggingface": HuggingFaceAdapter, "hf": HuggingFaceAdapter, "hugging-face": HuggingFaceAdapter,
  "ollama": OllamaAdapter, "local": OllamaAdapter,
  "together": TogetherAdapter, "together-ai": TogetherAdapter,
  "groq": GroqAdapter,
  "fireworks": FireworksAdapter, "fireworks-ai": FireworksAdapter,
  "openrouter": OpenRouterAdapter, "open-router": OpenRouterAdapter,
  "ai21": AI21Adapter, "jamba": AI21Adapter,
  "novita": NovitaAdapter, "novita-ai": NovitaAdapter,
};

// ── Bridge map ────────────────────────────────────────────────────────────────

const BRIDGES = {
  "langchain": LangChainBridge, "lang-chain": LangChainBridge,
  "langgraph": LangGraphBridge, "lang-graph": LangGraphBridge,
  "crewai": CrewAIBridge, "crew-ai": CrewAIBridge, "crew": CrewAIBridge,
  "autogen": AutoGenBridge, "microsoft-autogen": AutoGenBridge, "ms-autogen": AutoGenBridge,
  "openai-agents": OpenAIAgentsBridge, "openai-agents-sdk": OpenAIAgentsBridge, "agents-sdk": OpenAIAgentsBridge,
  "autogpt": OpenAIAgentsBridge,
  "swarm": SwarmBridge, "openai-swarm": SwarmBridge,
  "llamaindex": LlamaIndexBridge, "llama-index": LlamaIndexBridge,
  "semantic-kernel": SemanticKernelBridge, "sk": SemanticKernelBridge,
  "haystack": HaystackBridge,
  "flowise": FlowiseBridge,
  "dust": DustBridge,
  "agentgpt": AgentGPTBridge, "agent-gpt": AgentGPTBridge,
  "opendevin": OpenDevinBridge, "open-devin": OpenDevinBridge, "all-hands": OpenDevinBridge,
  "superagi": SuperAGIBridge, "super-agi": SuperAGIBridge,
  "metagpt": MetaGPTBridge, "meta-gpt": MetaGPTBridge,
  "smolagents": SmolAgentsBridge, "smol-agents": SmolAgentsBridge,
  "agno": AgnoBridge,
  "aaif": AAIFBridge, "linux-foundation": AAIFBridge,
  "mcp": MCPBridge, "model-context-protocol": MCPBridge,
  "n8n": N8NBridge,
  "zapier": ZapierBridge,
  "make": MakeBridge, "integromat": MakeBridge,
};

// ── Factory ───────────────────────────────────────────────────────────────────

function createLLM(provider, opts = {}) {
  const key     = provider.toLowerCase().trim();
  const Adapter = PROVIDERS[key];
  if (!Adapter) {
    throw new LLMConfigError(
      `Unknown LLM provider "${provider}".\nSupported: ${listProviders().join(", ")}`
    );
  }
  return new Adapter(opts);
}

function createBridge(framework, opts = {}) {
  const key    = framework.toLowerCase().trim();
  const Bridge = BRIDGES[key];
  if (!Bridge) {
    throw new LLMConfigError(
      `Unknown bridge "${framework}".\nSupported: ${listBridges().join(", ")}`
    );
  }
  return new Bridge(opts);
}

function listProviders() { return [...new Set(Object.keys(PROVIDERS))].sort(); }
function listBridges()   { return [...new Set(Object.keys(BRIDGES))].sort(); }

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  createLLM, createBridge, listProviders, listBridges,
  BaseLLMAdapter, LLMError, LLMConfigError,
  // Providers
  OpenAIAdapter, ClaudeAdapter, GeminiAdapter, VertexAIAdapter,
  AzureOpenAIAdapter, BedrockAdapter, MistralAdapter, CohereAdapter,
  GrokAdapter, PerplexityAdapter, DeepSeekAdapter, QwenAdapter, ERNIEAdapter,
  HuggingFaceAdapter, OllamaAdapter, TogetherAdapter, GroqAdapter,
  FireworksAdapter, OpenRouterAdapter, AI21Adapter, NovitaAdapter,
  // Bridges
  LangChainBridge, LangGraphBridge, CrewAIBridge, AutoGenBridge,
  OpenAIAgentsBridge, SwarmBridge, LlamaIndexBridge, SemanticKernelBridge,
  HaystackBridge, MCPBridge, N8NBridge, ZapierBridge, MakeBridge,
  SmolAgentsBridge, AgnoBridge, MetaGPTBridge, FlowiseBridge,
  SuperAGIBridge, AAIFBridge, OpenDevinBridge, AgentGPTBridge, DustBridge,
};
