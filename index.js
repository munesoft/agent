"use strict";

const { createAgent, Agent, AgentResponse }                              = require("./packages/core");
const { ExecutionEngine, ExecutionResult, ExecutionTimeoutError }        = require("./packages/core/execution");
const { IntentParser, IntentParseError }                                 = require("./packages/intent");
const { ToolRegistry, ToolRegistryError }                                = require("./packages/tools");
const { ActionRouter, RouterError, ToolNotFoundError, SchemaValidationError, UnresolvableIntentError } = require("./packages/router");
const { MemoryLayer, InMemoryAdapter, FileAdapter, MemoryError }         = require("./packages/memory");
const { Guardrails, GuardrailError, BlockedActionError }                 = require("./packages/guardrails");
const { EventBus, globalBus }                                            = require("./packages/events");
const { Orchestrator, PipelineResult, ParallelResult, OrchestratorError } = require("./packages/orchestrator");
const { WorkflowBuilder, Workflow, WorkflowResult, WorkflowError, NODE_TYPES } = require("./packages/workflow");

const llm = require("./packages/llm");

module.exports = {
  // Core
  createAgent, Agent, AgentResponse,
  ExecutionEngine, ExecutionResult, ExecutionTimeoutError,

  // Modules
  IntentParser, IntentParseError,
  ToolRegistry, ToolRegistryError,
  ActionRouter, RouterError, ToolNotFoundError, SchemaValidationError, UnresolvableIntentError,
  MemoryLayer, InMemoryAdapter, FileAdapter, MemoryError,
  Guardrails, GuardrailError, BlockedActionError,
  EventBus, globalBus,

  // Orchestration
  Orchestrator, PipelineResult, ParallelResult, OrchestratorError,

  // Workflow
  WorkflowBuilder, Workflow, WorkflowResult, WorkflowError, NODE_TYPES,

  // LLM — providers
  createLLM:       llm.createLLM,
  createBridge:    llm.createBridge,
  listProviders:   llm.listProviders,
  listBridges:     llm.listBridges,
  BaseLLMAdapter:  llm.BaseLLMAdapter,
  LLMError:        llm.LLMError,
  LLMConfigError:  llm.LLMConfigError,

  OpenAIAdapter:       llm.OpenAIAdapter,
  ClaudeAdapter:       llm.ClaudeAdapter,
  GeminiAdapter:       llm.GeminiAdapter,
  VertexAIAdapter:     llm.VertexAIAdapter,
  AzureOpenAIAdapter:  llm.AzureOpenAIAdapter,
  BedrockAdapter:      llm.BedrockAdapter,
  MistralAdapter:      llm.MistralAdapter,
  CohereAdapter:       llm.CohereAdapter,
  GrokAdapter:         llm.GrokAdapter,
  PerplexityAdapter:   llm.PerplexityAdapter,
  DeepSeekAdapter:     llm.DeepSeekAdapter,
  QwenAdapter:         llm.QwenAdapter,
  ERNIEAdapter:        llm.ERNIEAdapter,
  HuggingFaceAdapter:  llm.HuggingFaceAdapter,
  OllamaAdapter:       llm.OllamaAdapter,
  TogetherAdapter:     llm.TogetherAdapter,
  GroqAdapter:         llm.GroqAdapter,
  FireworksAdapter:    llm.FireworksAdapter,
  OpenRouterAdapter:   llm.OpenRouterAdapter,
  AI21Adapter:         llm.AI21Adapter,
  NovitaAdapter:       llm.NovitaAdapter,

  // LLM — bridges
  LangChainBridge:       llm.LangChainBridge,
  LangGraphBridge:       llm.LangGraphBridge,
  CrewAIBridge:          llm.CrewAIBridge,
  AutoGenBridge:         llm.AutoGenBridge,
  OpenAIAgentsBridge:    llm.OpenAIAgentsBridge,
  SwarmBridge:           llm.SwarmBridge,
  LlamaIndexBridge:      llm.LlamaIndexBridge,
  SemanticKernelBridge:  llm.SemanticKernelBridge,
  HaystackBridge:        llm.HaystackBridge,
  MCPBridge:             llm.MCPBridge,
  N8NBridge:             llm.N8NBridge,
  ZapierBridge:          llm.ZapierBridge,
  MakeBridge:            llm.MakeBridge,
  SmolAgentsBridge:      llm.SmolAgentsBridge,
  AgnoBridge:            llm.AgnoBridge,
  MetaGPTBridge:         llm.MetaGPTBridge,
  FlowiseBridge:         llm.FlowiseBridge,
  SuperAGIBridge:        llm.SuperAGIBridge,
  AAIFBridge:            llm.AAIFBridge,
  OpenDevinBridge:       llm.OpenDevinBridge,
  AgentGPTBridge:        llm.AgentGPTBridge,
  DustBridge:            llm.DustBridge,
};
