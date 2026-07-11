"use strict";

/**
 * @munesoft/agent v3.0.0
 * Main entry point — exports all modules.
 * Opt-in munesoft-stack adapters live at "@munesoft/agent/integrations".
 */

// Core
const { createAgent, Agent, AgentResponse }                              = require("./packages/core");
const { ExecutionEngine, ExecutionResult, ExecutionTimeoutError, ExecutionError, AbortedError, CircuitOpenError } = require("./packages/core/execution");

// Modules
const { IntentParser, IntentParseError }                                 = require("./packages/intent");
const { ToolRegistry, ToolRegistryError }                                = require("./packages/tools");
const { ActionRouter, RouterError, ToolNotFoundError, SchemaValidationError, UnresolvableIntentError, AmbiguousIntentError } = require("./packages/router");
const { MemoryLayer, InMemoryAdapter, FileAdapter, MemoryError }         = require("./packages/memory");
const { Guardrails, GuardrailError, BlockedActionError, UnknownIntentError, LowConfidenceError, OutputValidationError, RateLimitError, redact } = require("./packages/guardrails");
const { EventBus, globalBus }                                            = require("./packages/events");

// Verification + auto-repair
const { Verifier, VerificationReport, checks, VerifyError }              = require("./packages/verify");

// Session memory (searchable episodic history)
const { SessionStore, SessionStoreError, tokenize,
        attachRecorder, recordRun,
        makeRecallTool, createHistoryResearchAgent, CodingHistoryAdapter }         = require("./packages/session/exports");

// File-safe multi-agent coordination
const { FileCoordinator, FileConflictError, safeParallel, researchThenEdit } = require("./packages/coordination");

// LLM — universal adapter (providers + framework bridges)
const llm = require("./packages/llm");
const power = require("./packages/power");

// Orchestration
const { Orchestrator, PipelineResult, ParallelResult, OrchestratorError } = require("./packages/orchestrator");

// Workflow
const { WorkflowBuilder, Workflow, WorkflowResult, WorkflowError, NODE_TYPES } = require("./packages/workflow");

module.exports = {
  ApprovalPolicy: power.ApprovalPolicy,
  ApprovalPolicyError: power.ApprovalPolicyError,
  ApprovalDeniedError: power.ApprovalDeniedError,
  MemoryCheckpointStore: power.MemoryCheckpointStore,
  FileCheckpointStore: power.FileCheckpointStore,
  runDurable: power.runDurable,
  DurableWorkflowError: power.DurableWorkflowError,
  ModelRouter: power.ModelRouter,
  ModelRouterError: power.ModelRouterError,
  TraceCollector: power.TraceCollector,
  Evaluator: power.Evaluator,
  TraceError: power.TraceError,
  EvaluationError: power.EvaluationError,
  streamAgent: power.streamAgent,
  collectStream: power.collectStream,
  StreamError: power.StreamError,
  defineTool: power.defineTool,
  validateJsonSchema: power.validateJsonSchema,
  jsonSchemaToToolSchema: power.jsonSchemaToToolSchema,
  SchemaDefinitionError: power.SchemaDefinitionError,
  ToolInputValidationError: power.ToolInputValidationError,
  MCPDiscovery: power.MCPDiscovery,
  MCPDiscoveryError: power.MCPDiscoveryError,
  PluginRegistry: power.PluginRegistry,
  PluginError: power.PluginError,
  // ── Core ──────────────────────────────────────────────────────────────────
  createAgent, Agent, AgentResponse,
  ExecutionEngine, ExecutionResult, ExecutionTimeoutError, ExecutionError, AbortedError, CircuitOpenError, ExecutionError, AbortedError, CircuitOpenError,

  // ── Modules ───────────────────────────────────────────────────────────────
  IntentParser, IntentParseError,
  ToolRegistry, ToolRegistryError,
  ActionRouter, RouterError, ToolNotFoundError, SchemaValidationError, UnresolvableIntentError, AmbiguousIntentError,
  MemoryLayer, InMemoryAdapter, FileAdapter, MemoryError,
  Guardrails, GuardrailError, BlockedActionError, UnknownIntentError, LowConfidenceError, OutputValidationError, RateLimitError, redact,
  EventBus, globalBus,

  // ── Verification + auto-repair ──────────────────────────────────────────────
  Verifier, VerificationReport, checks, VerifyError,

  // ── Session memory ──────────────────────────────────────────────────────────
  SessionStore, SessionStoreError, tokenize,
  attachRecorder, recordRun,
  makeRecallTool, createHistoryResearchAgent, CodingHistoryAdapter,

  // ── File-safe coordination ──────────────────────────────────────────────────
  FileCoordinator, FileConflictError, safeParallel, researchThenEdit,

  // ── Orchestration ─────────────────────────────────────────────────────────
  Orchestrator, PipelineResult, ParallelResult, OrchestratorError,

  // ── Workflow ──────────────────────────────────────────────────────────────
  WorkflowBuilder, Workflow, WorkflowResult, WorkflowError, NODE_TYPES,

  // ── LLM — factory + introspection ───────────────────────────────────────────
  createLLM:       llm.createLLM,
  createBridge:    llm.createBridge,
  listProviders:   llm.listProviders,
  listBridges:     llm.listBridges,
  BaseLLMAdapter:  llm.BaseLLMAdapter,
  LLMError:        llm.LLMError,
  LLMConfigError:  llm.LLMConfigError,

  // ── LLM — providers (21) ────────────────────────────────────────────────────
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

  // ── LLM — framework bridges (23) ────────────────────────────────────────────
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

module.exports.CodingHistoryAdapter = CodingHistoryAdapter;
module.exports.ApprovalPolicy = power.ApprovalPolicy;
module.exports.ApprovalPolicyError = power.ApprovalPolicyError;
module.exports.ApprovalDeniedError = power.ApprovalDeniedError;
module.exports.MemoryCheckpointStore = power.MemoryCheckpointStore;
module.exports.FileCheckpointStore = power.FileCheckpointStore;
module.exports.runDurable = power.runDurable;
module.exports.DurableWorkflowError = power.DurableWorkflowError;
module.exports.ModelRouter = power.ModelRouter;
module.exports.ModelRouterError = power.ModelRouterError;
module.exports.TraceCollector = power.TraceCollector;
module.exports.Evaluator = power.Evaluator;
module.exports.TraceError = power.TraceError;
module.exports.EvaluationError = power.EvaluationError;
module.exports.streamAgent = power.streamAgent;
module.exports.collectStream = power.collectStream;
module.exports.StreamError = power.StreamError;
module.exports.defineTool = power.defineTool;
module.exports.validateJsonSchema = power.validateJsonSchema;
module.exports.jsonSchemaToToolSchema = power.jsonSchemaToToolSchema;
module.exports.SchemaDefinitionError = power.SchemaDefinitionError;
module.exports.ToolInputValidationError = power.ToolInputValidationError;
module.exports.MCPDiscovery = power.MCPDiscovery;
module.exports.MCPDiscoveryError = power.MCPDiscoveryError;
module.exports.PluginRegistry = power.PluginRegistry;
module.exports.PluginError = power.PluginError;
