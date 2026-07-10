"use strict";

<<<<<<< HEAD
/**
 * @munesoft/agent v3.0.0
 * Main entry point — exports all modules.
 * Opt-in munesoft-stack adapters live at "@munesoft/agent/integrations".
 */

// Core
const { createAgent, Agent, AgentResponse }                              = require("./packages/core");
const { ExecutionEngine, ExecutionResult, ExecutionTimeoutError }        = require("./packages/core/execution");

// Modules
const { IntentParser, IntentParseError }                                 = require("./packages/intent");
const { ToolRegistry, ToolRegistryError }                                = require("./packages/tools");
const { ActionRouter, RouterError, ToolNotFoundError, SchemaValidationError, UnresolvableIntentError, AmbiguousIntentError } = require("./packages/router");
const { MemoryLayer, InMemoryAdapter, FileAdapter, MemoryError }         = require("./packages/memory");
const { Guardrails, GuardrailError, BlockedActionError, RateLimitError, redact } = require("./packages/guardrails");
const { EventBus, globalBus }                                            = require("./packages/events");

// Verification + auto-repair
const { Verifier, VerificationReport, checks, VerifyError }              = require("./packages/verify");

// Session memory (searchable episodic history)
const { SessionStore, SessionStoreError, tokenize,
        attachRecorder, recordRun,
        makeRecallTool, createHistoryResearchAgent }                     = require("./packages/session/exports");

// File-safe multi-agent coordination
const { FileCoordinator, FileConflictError, safeParallel, researchThenEdit } = require("./packages/coordination");

// LLM — universal adapter (providers + framework bridges)
const llm = require("./packages/llm");

// Orchestration
const { Orchestrator, PipelineResult, ParallelResult, OrchestratorError } = require("./packages/orchestrator");

// Workflow
const { WorkflowBuilder, Workflow, WorkflowResult, WorkflowError, NODE_TYPES } = require("./packages/workflow");

module.exports = {
  // ── Core ──────────────────────────────────────────────────────────────────
  createAgent, Agent, AgentResponse,
  ExecutionEngine, ExecutionResult, ExecutionTimeoutError,

  // ── Modules ───────────────────────────────────────────────────────────────
  IntentParser, IntentParseError,
  ToolRegistry, ToolRegistryError,
  ActionRouter, RouterError, ToolNotFoundError, SchemaValidationError, UnresolvableIntentError, AmbiguousIntentError,
  MemoryLayer, InMemoryAdapter, FileAdapter, MemoryError,
  Guardrails, GuardrailError, BlockedActionError, RateLimitError, redact,
  EventBus, globalBus,

  // ── Verification + auto-repair ──────────────────────────────────────────────
  Verifier, VerificationReport, checks, VerifyError,

  // ── Session memory ──────────────────────────────────────────────────────────
  SessionStore, SessionStoreError, tokenize,
  attachRecorder, recordRun,
  makeRecallTool, createHistoryResearchAgent,

  // ── File-safe coordination ──────────────────────────────────────────────────
  FileCoordinator, FileConflictError, safeParallel, researchThenEdit,

  // ── Orchestration ─────────────────────────────────────────────────────────
  Orchestrator, PipelineResult, ParallelResult, OrchestratorError,

  // ── Workflow ──────────────────────────────────────────────────────────────
  WorkflowBuilder, Workflow, WorkflowResult, WorkflowError, NODE_TYPES,

  // ── LLM — factory + introspection ───────────────────────────────────────────
=======
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
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
  createLLM:       llm.createLLM,
  createBridge:    llm.createBridge,
  listProviders:   llm.listProviders,
  listBridges:     llm.listBridges,
  BaseLLMAdapter:  llm.BaseLLMAdapter,
  LLMError:        llm.LLMError,
  LLMConfigError:  llm.LLMConfigError,

<<<<<<< HEAD
  // ── LLM — providers (21) ────────────────────────────────────────────────────
=======
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
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

<<<<<<< HEAD
  // ── LLM — framework bridges (23) ────────────────────────────────────────────
=======
  // LLM — bridges
>>>>>>> 8246ad4aceaf91a475b81dd0c18edecc194527cf
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
