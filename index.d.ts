// Type definitions for @munesoft/agent
// Project: Munesoft Agent Framework

export type FieldType = "string" | "number" | "integer" | "boolean" | "array" | "object" | "any";

export interface FieldSchema {
  type: FieldType;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
  min?: number; max?: number;
  minLength?: number; maxLength?: number;
  pattern?: string;
  items?: FieldType;
  description?: string;
}

export type ToolSchema = Record<string, FieldType | `${FieldType}?` | FieldSchema>;

export interface ToolOptions { timeout?: number; retries?: number; tags?: string[]; aliases?: string[]; }

export interface Tool<A = any, O = any> {
  name: string;
  description: string;
  schema?: ToolSchema;
  aliases?: string[];
  handler: (args: A, context: RunContext) => Promise<O> | O;
  options?: ToolOptions;
}

export interface Intent { action: string; params?: Record<string, unknown>; confidence?: number; raw?: string; }

export interface RouteDecision {
  strategy: "exact" | "alias" | "tag" | "fuzzy" | "fallback" | "ambiguous" | "llm-disambiguated" | "none";
  tool?: string; score: number;
  candidates: Array<{ name: string; score: number }>;
  resolved?: string;
}

export interface RunContext {
  agent: Agent; memory: MemoryLayer; sessionId: string;
  signal?: AbortSignal;
  _verification?: { failed: boolean; feedback: string; previousOutput: unknown };
  [key: string]: unknown;
}

// ── Router Brain ────────────────────────────────────────────────────────────────
export interface RouterOptions {
  debug?: boolean;
  threshold?: number;
  ambiguityGap?: number;
  fallbackTool?: string;
  aliases?: Record<string, string>;
  strict?: boolean;
  disambiguate?: (intent: Intent, candidates: Array<{ name: string; score: number }>) => Promise<string> | string;
}
export class ActionRouter {
  constructor(registry: ToolRegistry, opts?: RouterOptions);
  route(intent: Intent): Promise<{ tool: Tool; args: Record<string, unknown>; decision: RouteDecision }>;
}
export class RouterError extends Error {}
export class ToolNotFoundError extends RouterError { candidates: Array<{ name: string; score: number }>; }
export class UnresolvableIntentError extends RouterError {}
export class SchemaValidationError extends RouterError {}
export class AmbiguousIntentError extends RouterError { candidates: Array<{ name: string; score: number }>; }

// ── Verification ────────────────────────────────────────────────────────────────
export type CheckResult = boolean | string | { ok: boolean; reason?: string } | void;
export type CheckFn = (output: unknown, ctx: { input?: string; tool?: string; args?: unknown }) => Promise<CheckResult> | CheckResult;
export interface CheckSpec { name?: string; fn: CheckFn; severity?: "error" | "warn"; }

export interface VerifierOptions { debug?: boolean; minScore?: number; checks?: Array<CheckSpec | CheckFn>; }
export class Verifier {
  constructor(opts?: VerifierOptions);
  check(spec: CheckSpec | CheckFn): this;
  verify(output: unknown, ctx?: { input?: string; tool?: string; args?: unknown }): Promise<VerificationReport>;
  readonly size: number;
}
export class VerificationReport {
  passed: boolean; score: number;
  checks: Array<{ name: string; ok: boolean; reason: string | null; severity: string }>;
  failures: Array<{ name: string; ok: boolean; reason: string | null; severity: string }>;
  feedback: string; timestamp: string;
  toJSON(): object;
}
export const checks: {
  notEmpty(): CheckSpec;
  hasKeys(keys: string[]): CheckSpec;
  matches(pattern: RegExp | string, field?: string): CheckSpec;
  type(t: string, field?: string): CheckSpec;
  range(field: string, bounds: { min?: number; max?: number }): CheckSpec;
  jsonShape(shape: Record<string, string>): CheckSpec;
  custom(fn: CheckFn, name?: string): CheckSpec;
  llmCheck(llm: LLMAdapter, criteria: string, opts?: { name?: string; severity?: "error" | "warn" }): CheckSpec;
};
export class VerifyError extends Error {}

// ── Core Agent ──────────────────────────────────────────────────────────────────
export interface AgentConfig {
  name?: string;
  tools?: Tool[];
  rules?: Array<{ pattern: RegExp | string; action: string; extract?: (match: RegExpExecArray | string[], input: string) => Record<string, unknown>; confidence?: number }>;
  llmProvider?: LLMAdapter;
  useFunctionCalling?: boolean;
  router?: ActionRouter;
  routing?: RouterOptions;
  execution?: ExecutionOptions;
  memory?: MemoryLayer | MemoryOptions;
  guardrails?: false | Guardrails | GuardrailsOptions;
  verify?: Verifier | VerifierOptions;
  maxRepairs?: number;
  events?: EventBus;
  debug?: boolean;
}
export function createAgent(config?: AgentConfig): Agent;
export class Agent {
  name: string;
  registry: ToolRegistry; router: ActionRouter; memory: MemoryLayer;
  guardrails: Guardrails | null; verifier: Verifier | null; events: EventBus;
  run(input: string, context?: Partial<RunContext>): Promise<AgentResponse>;
  stream(input: string, onEvent?: (stage: string, data: any) => void, context?: Partial<RunContext>): Promise<AgentResponse>;
  addTool(tool: Tool): this;
  addCheck(spec: CheckSpec | CheckFn): this;
  use(fn: (input: string, ctx: RunContext) => Promise<string | void> | string | void): this;
  onError(fn: (err: Error, meta: { input: string; context: RunContext }) => Promise<AgentResponse | void> | AgentResponse | void): this;
  getHistory(n?: number): Array<{ role: string; content: string; timestamp: string }>;
  reset(): this;
  inspect(): object;
}
export class AgentResponse {
  success: boolean; input: string; intent: Intent | null; tool: string | null;
  decision: RouteDecision | null; output: unknown; error: Error | null;
  verification: VerificationReport | null; steps: any[]; repairs: number;
  duration: number; sessionId: string; timestamp: string;
  toJSON(): object;
}

// ── Execution ───────────────────────────────────────────────────────────────────
export interface ExecutionOptions {
  timeout?: number; retries?: number; maxBackoff?: number; jitter?: boolean;
  breakerThreshold?: number; breakerCooldown?: number;
  onBeforeExecute?: (info: any) => any; onAfterExecute?: (info: any) => any; onAttempt?: (info: any) => any;
  debug?: boolean;
}
export class ExecutionEngine {
  constructor(opts?: ExecutionOptions);
  execute(tool: Tool, args: Record<string, unknown>, context?: Partial<RunContext>): Promise<ExecutionResult>;
}
export class ExecutionResult {
  status: "success" | "error"; tool: string; args: unknown; output: unknown;
  error: Error | null; duration: number; attempt: number; timestamp: string;
  readonly success: boolean; readonly failed: boolean;
  toJSON(): object;
}
export class ExecutionTimeoutError extends Error {}
export class AbortedError extends Error {}
export class CircuitOpenError extends Error {}

// ── Tools / Intent ──────────────────────────────────────────────────────────────
export class ToolRegistry {
  register(tool: Tool): this; override(tool: Tool): this; unregister(name: string): this;
  get(name: string): Tool | null; has(name: string): boolean;
  list(): Array<{ name: string; description: string; schema: ToolSchema; aliases: string[]; tags: string[] }>;
  getByTag(tag: string): any[];
}
export class ToolRegistryError extends Error {}
export class IntentParser {
  constructor(opts?: { llmProvider?: LLMAdapter; fallbackRules?: any[]; useFunctionCalling?: boolean; debug?: boolean });
  parse(input: string, availableTools?: any[]): Promise<Intent>;
  addRule(rule: any): this;
}
export class IntentParseError extends Error {}

// ── Memory ──────────────────────────────────────────────────────────────────────
export interface MemoryOptions { adapter?: MemoryAdapter; maxShortTermItems?: number; ttl?: number; namespace?: string; debug?: boolean; }
export interface MemoryAdapter { get(k: string): Promise<any>; set(k: string, v: any): Promise<void>; delete(k: string): Promise<void>; keys(): Promise<string[]>; }
export class MemoryLayer {
  constructor(opts?: MemoryOptions);
  set(k: string, v: any): this; get(k: string): any; has(k: string): boolean; delete(k: string): this; clear(): this; sweep(): this;
  snapshot(): Record<string, any>;
  addMessage(role: string, content: string): this; getHistory(limit?: number): any[]; clearHistory(): this;
  persist(k: string, v: any): Promise<this>; recall(k: string): Promise<any>; forget(k: string): Promise<this>;
}
export class InMemoryAdapter implements MemoryAdapter { get(k: string): Promise<any>; set(k: string, v: any): Promise<void>; delete(k: string): Promise<void>; keys(): Promise<string[]>; }
export class FileAdapter implements MemoryAdapter { constructor(opts?: { path?: string }); get(k: string): Promise<any>; set(k: string, v: any): Promise<void>; delete(k: string): Promise<void>; keys(): Promise<string[]>; }
export class MemoryError extends Error {}

// ── Session memory (searchable episodic) ─────────────────────────────────────────
export interface SessionRecordInput {
  id?: string; sessionId?: string; ts?: string; agent?: string; task?: string;
  intent?: unknown; decisions?: string[]; toolsUsed?: string[]; filesTouched?: string[];
  outcome?: string; summary?: string; events?: unknown[];
}
export interface SearchHit { id: string; score: number; snippet: string; session: any; }
export class SessionStore {
  constructor(opts?: { path?: string | null; maxSnippet?: number; debug?: boolean });
  record(s: SessionRecordInput): any;
  search(query: string, opts?: { limit?: number; file?: string; terms?: string[] }): SearchHit[];
  searchByFile(file: string, limit?: number): SearchHit[];
  get(id: string, opts?: { withText?: boolean }): any;
  recent(n?: number): any[];
  stats(): { sessions: number; uniqueTerms: number; indexedFiles: number };
}
export class SessionStoreError extends Error {}
export function tokenize(text: string): string[];
export function attachRecorder(agent: Agent, store: SessionStore, opts?: { agentName?: string; extractFiles?: (ctx: any) => string[]; extractDecisions?: (ctx: any) => string[] }): () => void;
export function recordRun(store: SessionStore, run: SessionRecordInput): any;
export function makeRecallTool(source: SessionStore | CtxAdapter, opts?: { name?: string; description?: string }): Tool;
export interface ResearchReport {
  task: string;
  relatedSessions: Array<{ id: string; score: number; snippet: string; outcome?: string }>;
  filesPreviouslyTouched: string[]; priorDecisions: string[]; knownGotchas: string[]; brief: string;
}
export function createHistoryResearchAgent(cfg: { store: SessionStore | CtxAdapter; llm?: LLMAdapter; limit?: number }): { research(task: string, files?: string[]): Promise<ResearchReport> };
export class CtxAdapter {
  constructor(opts?: { bin?: string; debug?: boolean });
  available(): boolean;
  search(query: string, opts?: { limit?: number; file?: string; terms?: string[] }): Promise<SearchHit[]>;
  show(kind: string, id: string, window?: number): string | null;
}

// ── Coordination ─────────────────────────────────────────────────────────────────
export class FileCoordinator {
  constructor(opts?: { debug?: boolean });
  acquire(owner: string, files: string[]): { ok: boolean; conflicts: Array<{ file: string; owner: string }> };
  release(owner: string): this; whoHas(file: string): string | null; active(): string[];
}
export class FileConflictError extends Error { conflicts: Array<{ file: string; owner: string }>; }
export interface ParallelTask { agent: string; input: string | ((report: ResearchReport) => string); files?: string[]; }
export function safeParallel(orch: Orchestrator, tasks: ParallelTask[], opts?: { coordinator?: FileCoordinator; onConflict?: "reject" | "serialize"; context?: object; debug?: boolean }): Promise<{ success: boolean; duration: number; outputs: any[]; raw: any[] }>;
export function researchThenEdit(cfg: { orchestrator: Orchestrator; researcher: { research: Function }; task: string; editors: ParallelTask[]; coordinator?: FileCoordinator; onConflict?: "reject" | "serialize" }): Promise<{ report: ResearchReport; execution: any }>;

// ── Guardrails ───────────────────────────────────────────────────────────────────
export interface GuardrailsOptions {
  maxRetries?: number; allowedActions?: string[]; blockedActions?: string[];
  outputValidators?: Array<(o: unknown, t: Tool) => true | string>;
  inputSanitizers?: Array<(s: string) => string>;
  maxInputLength?: number; minConfidence?: number;
  redactSecrets?: boolean; blockOutputSecrets?: boolean;
  rateLimit?: number; rateWindowMs?: number; debug?: boolean;
}
export class Guardrails {
  constructor(opts?: GuardrailsOptions);
  sanitizeInput(input: string): string; validateIntent(intent: Intent): boolean; validateOutput(result: ExecutionResult, tool: Tool): boolean;
  addInputSanitizer(fn: (s: string) => string): this; addOutputValidator(fn: (o: unknown, t: Tool) => true | string): this;
  blockAction(name: string): this; allowOnly(names: string[]): this; summary(): object;
}
export class GuardrailError extends Error {}
export class BlockedActionError extends GuardrailError {}
export class RateLimitError extends GuardrailError {}
export function redact(s: string): string;

// ── Events ───────────────────────────────────────────────────────────────────────
export class EventBus {
  constructor(opts?: { maxHistory?: number });
  on(event: string, handler: (payload: any) => void): () => void;
  once(event: string, handler: (payload: any) => void): () => void;
  off(event: string, handler: Function): this;
  emit(event: string, payload?: any): void;
  emitAsync(event: string, payload?: any): Promise<void>;
  waitFor(event: string, opts?: { predicate?: (p: any) => boolean; timeout?: number }): Promise<any>;
  history(event?: string, limit?: number): any[];
  clear(): this;
}
export const globalBus: EventBus;

// ── Orchestration ────────────────────────────────────────────────────────────────
export class Orchestrator {
  constructor(opts?: { debug?: boolean; maxDepth?: number; timeout?: number; coordinator?: FileCoordinator });
  register(name: string, agent: Agent): this; unregister(name: string): this;
  get(name: string): Agent; has(name: string): boolean; list(): string[];
  run(name: string, input: string, context?: object): Promise<AgentResponse>;
  pipeline(steps: Array<{ agent: string; input: string | ((prev: any, all: any[]) => string); stopOnError?: boolean; label?: string }>, context?: object): Promise<PipelineResult>;
  parallel(tasks: ParallelTask[], context?: object): Promise<ParallelResult>;
  route(input: string, selector: (input: string, agents: string[]) => Promise<string> | string, context?: object): Promise<AgentResponse>;
  llmRoute(input: string, llm: LLMAdapter, agentDescriptions?: Record<string, string>): Promise<AgentResponse>;
  enableHandoff(agentName: string, targetAgents: string[]): this;
}
export class PipelineResult { steps: any[]; success: boolean; duration: number; stoppedAt: number | null; finalOutput: unknown; toJSON(): object; }
export class ParallelResult { tasks: any[]; success: boolean; duration: number; outputs: any[]; toJSON(): object; }
export class OrchestratorError extends Error {}

// ── Workflow ─────────────────────────────────────────────────────────────────────
export const NODE_TYPES: Record<string, string>;
export class WorkflowBuilder {
  constructor(opts?: { name?: string; description?: string; debug?: boolean });
  start(id?: string): this; end(id?: string): this;
  agent(id: string, config: { agent: string; input?: string | ((ctx: any) => string); label?: string }): this;
  condition(id: string, config: { condition: (ctx: any) => boolean; onTrue?: string; onFalse?: string }): this;
  transform(id: string, fn: (ctx: any) => any): this;
  parallel(id: string, branches: any[]): this; delay(id: string, ms: number): this;
  log(id: string, message: string): this; retry(id: string, config: { targetNode: string; maxRetries?: number }): this;
  connect(from: string, to: string, label?: string): this; build(): Workflow;
}
export class Workflow { name: string; run(orchestrator: Orchestrator, input?: any): Promise<WorkflowResult>; toJSON(): object; }
export class WorkflowResult { success: boolean; toJSON(): object; }
export class WorkflowError extends Error {}

// ── LLM ──────────────────────────────────────────────────────────────────────────
export interface LLMOptions { apiKey?: string; model?: string; baseURL?: string; temperature?: number; maxTokens?: number; requestTimeout?: number; debug?: boolean; }
export interface LLMAdapter {
  complete(args: { system?: string; user: string; format?: "json" }): Promise<string>;
  functionCall?(args: { system?: string; user: string; tools: any[] }): Promise<Intent>;
}
export class BaseLLMAdapter implements LLMAdapter { constructor(opts?: LLMOptions); complete(args: { system?: string; user: string; format?: "json" }): Promise<string>; functionCall(args: { system?: string; user: string; tools: any[] }): Promise<Intent>; }
export class LLMError extends Error {}
export class LLMConfigError extends LLMError {}
export function createLLM(provider: string, opts?: LLMOptions): LLMAdapter;
export function createBridge(framework: string, opts?: object): any;
export function listProviders(): string[];
export function listBridges(): string[];

export class OpenAIAdapter extends BaseLLMAdapter {}
export class ClaudeAdapter extends BaseLLMAdapter {}
export class GeminiAdapter extends BaseLLMAdapter {}
export class VertexAIAdapter extends BaseLLMAdapter {}
export class AzureOpenAIAdapter extends BaseLLMAdapter {}
export class BedrockAdapter extends BaseLLMAdapter {}
export class MistralAdapter extends BaseLLMAdapter {}
export class CohereAdapter extends BaseLLMAdapter {}
export class GrokAdapter extends BaseLLMAdapter {}
export class PerplexityAdapter extends BaseLLMAdapter {}
export class DeepSeekAdapter extends BaseLLMAdapter {}
export class QwenAdapter extends BaseLLMAdapter {}
export class ERNIEAdapter extends BaseLLMAdapter {}
export class HuggingFaceAdapter extends BaseLLMAdapter {}
export class OllamaAdapter extends BaseLLMAdapter {}
export class TogetherAdapter extends BaseLLMAdapter {}
export class GroqAdapter extends BaseLLMAdapter {}
export class FireworksAdapter extends BaseLLMAdapter {}
export class OpenRouterAdapter extends BaseLLMAdapter {}
export class AI21Adapter extends BaseLLMAdapter {}
export class NovitaAdapter extends BaseLLMAdapter {}
