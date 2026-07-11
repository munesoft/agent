import type { Tool, Agent, EventBus, Orchestrator } from "../../index";

export class IntegrationError extends Error { pkg: string; }
export function isAvailable(pkg: string): boolean;
export const STACK: Record<string, { adapters: string[]; use: string }>;
export function stackStatus(): Record<string, { adapters: string[]; use: string; installed: boolean }>;
export function idFactory(opts?: { length?: number; prefix?: string }): { id(len?: number): string; time(): string; readable(): string };
export function withStableIds<T extends object>(context?: T, opts?: { prefix?: string }): T & { sessionId: string };
export function mergeSettings<T extends object>(target: T, ...sources: object[]): T;
export function safeGet<T = unknown>(obj: unknown, path: string, fallback?: T): T | undefined;
export function applyDefaults<T extends object>(target: T, defaults: Partial<T>): T;
export function hasPath(obj: unknown, path: string): boolean;
export function withRetry<T>(fn: (ctx: { attempt: number; signal: AbortSignal }) => Promise<T> | T, opts?: object): Promise<T>;
export function retryableTool(tool: Tool, opts?: object): Tool;
export function normalizeResponse<T = Record<string, unknown>>(data: unknown, schema: object, options?: object): { success: boolean; data?: T; error?: string };
export function inferResponseSchema(sample: unknown): object;
export function normalizingTool(tool: Tool, schema: object, options?: object): Tool;
export function createMemoryxStore(opts?: object): {
  memory: any;
  record(session: object): Promise<object>;
  search(query: string, opts?: { limit?: number }): Promise<Array<{ id: string; score: number; snippet: string; session: any }>>;
};
export function runAgentLoop(agent: Agent, input: string, opts?: {
  maxIterations?: number;
  until?: (response: any, step: any) => boolean | Promise<boolean>;
  next?: (step: any, responses: any[]) => string;
  sessionId?: string;
  [key: string]: unknown;
}): Promise<{ result: any; responses: any[]; final: any | null }>;
export function loadAgentEnv(schema?: object, opts?: { path?: string; override?: boolean; strict?: boolean; debug?: boolean }): Promise<Record<string, unknown>>;
export function attachLogx(target: Agent | EventBus, opts?: { events?: string[]; prefix?: string }): Promise<() => void>;
export function boundedParallel(orch: Orchestrator, tasks: Array<{ agent: string; input: any; files?: string[] }>, opts?: {
  concurrency?: number; context?: object; [key: string]: unknown;
}): Promise<{ success: boolean; outputs: Array<{ agent: string; success: boolean; output: unknown }>; raw: any[] }>;
