"use strict";

/**
 * @munesoft/agent — Intent Parser
 * Converts natural language → { action, params, confidence }.
 * Supports rule-based patterns, LLM completion, and native function calling.
 */

class IntentParser {
  constructor(opts = {}) {
    this.llmProvider   = opts.llmProvider   || null;
    this.fallbackRules = opts.fallbackRules  || [];
    this.debug         = opts.debug          || false;
    this.useFunctionCalling = opts.useFunctionCalling !== false; // default on
  }

  async parse(input, availableTools = []) {
    if (!input || typeof input !== "string") throw new IntentParseError("Input must be a non-empty string");
    const trimmed = input.trim();
    if (!trimmed) throw new IntentParseError("Input must be a non-empty string");

    // 1. Native function calling (most accurate, uses tool schemas directly)
    if (this.llmProvider && this.useFunctionCalling && availableTools.length > 0 &&
        typeof this.llmProvider.functionCall === "function") {
      try {
        const intent = await this.llmProvider.functionCall({ user: trimmed, tools: availableTools });
        if (intent.action !== "unknown") {
          if (this.debug) console.log("[Intent] function-call:", intent);
          return intent;
        }
      } catch (e) {
        if (this.debug) console.warn("[Intent] function-call failed:", e.message);
      }
    }

    // 2. LLM JSON completion fallback
    if (this.llmProvider && typeof this.llmProvider.complete === "function") {
      try {
        return await this._parseLLM(trimmed, availableTools);
      } catch (e) {
        if (this.debug) console.warn("[Intent] LLM completion failed:", e.message);
      }
    }

    // 3. Rule-based matching
    const ruleMatch = this._parseRules(trimmed);
    if (ruleMatch) return ruleMatch;

    // 4. Unknown
    return { action: "unknown", params: { raw_input: trimmed }, confidence: 0, raw: trimmed };
  }

  async _parseLLM(input, tools) {
    const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join("\n");
    const system = `You are an intent parser. Given user input and tools, extract the action and params.
Available tools:\n${toolList || "none"}
Respond ONLY with JSON: {"action":"tool_name_or_unknown","params":{},"confidence":0.0-1.0}`;
    const raw = await this.llmProvider.complete({ system, user: input, format: "json" });
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed.action) throw new IntentParseError("LLM returned invalid intent");
    return { action: parsed.action, params: parsed.params || {}, confidence: parsed.confidence ?? 0.5, raw: input };
  }

  _parseRules(input) {
    for (const rule of this.fallbackRules) {
      if (rule.pattern instanceof RegExp) rule.pattern.lastIndex = 0;
      const m = rule.pattern instanceof RegExp
        ? rule.pattern.exec(input)
        : input.toLowerCase().includes(rule.pattern.toLowerCase()) ? [input] : null;
      if (m) {
        const params = typeof rule.extract === "function" ? rule.extract(m, input) : {};
        return { action: rule.action, params, confidence: rule.confidence ?? 0.7, raw: input };
      }
    }
    return null;
  }

  addRule(rule) {
    if (!rule.pattern || !rule.action) throw new IntentParseError("Rule needs pattern and action");
    this.fallbackRules.push(rule);
    return this;
  }
}

class IntentParseError extends Error { constructor(m) { super(m); this.name = "IntentParseError"; } }

module.exports = { IntentParser, IntentParseError };
