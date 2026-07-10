"use strict";

/**
 * @munesoft/agent — LLM Providers
 * Every major LLM provider with native function/tool calling where supported.
 *
 * Providers:
 *   OpenAI · Anthropic Claude · Google Gemini · Google Vertex AI
 *   Meta LLaMA (via Together, Groq, Fireworks, Replicate, AWS Bedrock)
 *   Microsoft Azure OpenAI · AWS Bedrock · Mistral AI · Cohere
 *   xAI Grok · Perplexity AI · DeepSeek · Alibaba Qwen · Baidu ERNIE
 *   Hugging Face Inference · Ollama (local) · Together AI · Groq
 *   Fireworks AI · Replicate · AI21 Labs · NovitaAI · OpenRouter
 */

const { BaseLLMAdapter, LLMError, LLMConfigError } = require("../base");

// ── OpenAI ────────────────────────────────────────────────────────────────────

class OpenAIAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey  = opts.apiKey  || process.env.OPENAI_API_KEY;
    this.model   = opts.model   || "gpt-4o";
    this.baseURL = opts.baseURL || "api.openai.com";
    if (!this.apiKey) throw new LLMConfigError("OpenAI requires apiKey");
  }

  async complete({ system, user, format }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
    };
    const data = await this._post(this.baseURL, "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post(this.baseURL, "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── Anthropic Claude ──────────────────────────────────────────────────────────

class ClaudeAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
    this.model  = opts.model  || "claude-3-5-sonnet-20241022";
    if (!this.apiKey) throw new LLMConfigError("Claude requires apiKey");
  }

  async complete({ system, user, format }) {
    const body = { model: this.model, max_tokens: this.maxTokens, system: system || "", messages: [{ role: "user", content: user }] };
    const data = await this._post("api.anthropic.com", "/v1/messages", { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" }, body);
    let text = data.content[0].text;
    if (format === "json") { const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/); if (m) text = m[1]; }
    return text;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model, max_tokens: this.maxTokens,
      system: system || "Use the provided tools to complete the request.",
      messages: [{ role: "user", content: user }],
      tools: this._toClaudeTools(tools), tool_choice: { type: "auto" },
    };
    const data    = await this._post("api.anthropic.com", "/v1/messages", { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" }, body);
    const toolUse = data.content.find(c => c.type === "tool_use");
    if (toolUse) return this._intent(toolUse.name, toolUse.input || {}, user);
    return this._unknown(user);
  }
}

// ── Google Gemini ─────────────────────────────────────────────────────────────

class GeminiAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    this.model  = opts.model  || "gemini-1.5-flash";
    if (!this.apiKey) throw new LLMConfigError("Gemini requires apiKey");
  }

  async complete({ system, user, format }) {
    const body = {
      contents: [{ role: "user", parts: [{ text: system ? `${system}\n\n${user}` : user }] }],
      generationConfig: { temperature: this.temperature, maxOutputTokens: this.maxTokens, ...(format === "json" ? { responseMimeType: "application/json" } : {}) },
    };
    const data = await this._post("generativelanguage.googleapis.com", `/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, {}, body);
    return data.candidates[0].content.parts[0].text;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      contents: [{ role: "user", parts: [{ text: system ? `${system}\n\n${user}` : user }] }],
      tools: [{ functionDeclarations: this._toGeminiTools(tools) }],
    };
    const data = await this._post("generativelanguage.googleapis.com", `/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, {}, body);
    const part = data.candidates[0].content.parts[0];
    if (part.functionCall) return this._intent(part.functionCall.name, part.functionCall.args || {}, user);
    return this._unknown(user);
  }
}

// ── Google Vertex AI ──────────────────────────────────────────────────────────

class VertexAIAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.projectId = opts.projectId || process.env.GOOGLE_CLOUD_PROJECT;
    this.location  = opts.location  || "us-central1";
    this.model     = opts.model     || "gemini-1.5-pro";
    this.token     = opts.accessToken || process.env.GOOGLE_ACCESS_TOKEN;
    if (!this.projectId) throw new LLMConfigError("VertexAI requires projectId");
    if (!this.token)     throw new LLMConfigError("VertexAI requires accessToken");
  }

  async complete({ system, user }) {
    const path = `/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;
    const body = { contents: [{ role: "user", parts: [{ text: system ? `${system}\n\n${user}` : user }] }], generationConfig: { temperature: this.temperature, maxOutputTokens: this.maxTokens } };
    const data = await this._post(`${this.location}-aiplatform.googleapis.com`, path, { Authorization: `Bearer ${this.token}` }, body);
    return data.candidates[0].content.parts[0].text;
  }

  async functionCall({ system, user, tools }) {
    const path = `/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;
    const body = { contents: [{ role: "user", parts: [{ text: system ? `${system}\n\n${user}` : user }] }], tools: [{ functionDeclarations: this._toGeminiTools(tools) }] };
    const data = await this._post(`${this.location}-aiplatform.googleapis.com`, path, { Authorization: `Bearer ${this.token}` }, body);
    const part = data.candidates[0].content.parts[0];
    if (part.functionCall) return this._intent(part.functionCall.name, part.functionCall.args || {}, user);
    return this._unknown(user);
  }
}

// ── Microsoft Azure OpenAI ────────────────────────────────────────────────────

class AzureOpenAIAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey     = opts.apiKey     || process.env.AZURE_OPENAI_API_KEY;
    this.endpoint   = opts.endpoint   || process.env.AZURE_OPENAI_ENDPOINT;   // e.g. myresource.openai.azure.com
    this.deployment = opts.deployment || process.env.AZURE_OPENAI_DEPLOYMENT;  // deployment name
    this.apiVersion = opts.apiVersion || "2024-02-01";
    this.model      = opts.model      || this.deployment;
    if (!this.apiKey)     throw new LLMConfigError("AzureOpenAI requires apiKey");
    if (!this.endpoint)   throw new LLMConfigError("AzureOpenAI requires endpoint");
    if (!this.deployment) throw new LLMConfigError("AzureOpenAI requires deployment");
  }

  async complete({ system, user, format }) {
    const path = `/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;
    const body = {
      temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
    };
    const data = await this._post(this.endpoint, path, { "api-key": this.apiKey }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const path = `/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;
    const body = {
      temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post(this.endpoint, path, { "api-key": this.apiKey }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── AWS Bedrock ───────────────────────────────────────────────────────────────
// Supports: Claude, LLaMA, Mistral, Cohere, Titan, Nova via unified Converse API

class BedrockAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.region          = opts.region          || process.env.AWS_REGION || "us-east-1";
    this.model           = opts.model           || "anthropic.claude-3-5-sonnet-20241022-v2:0";
    this.accessKeyId     = opts.accessKeyId     || process.env.AWS_ACCESS_KEY_ID;
    this.secretAccessKey = opts.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    this.sessionToken    = opts.sessionToken    || process.env.AWS_SESSION_TOKEN;
    if (!this.accessKeyId)     throw new LLMConfigError("Bedrock requires accessKeyId");
    if (!this.secretAccessKey) throw new LLMConfigError("Bedrock requires secretAccessKey");
  }

  async complete({ system, user }) {
    // Uses Bedrock Converse API (unified across all models)
    const body = {
      modelId: this.model,
      system:  system ? [{ text: system }] : undefined,
      messages: [{ role: "user", content: [{ text: user }] }],
      inferenceConfig: { maxTokens: this.maxTokens, temperature: this.temperature },
    };
    const hostname = `bedrock-runtime.${this.region}.amazonaws.com`;
    const path     = `/model/${encodeURIComponent(this.model)}/converse`;
    const headers  = await this._signAWS("POST", hostname, path, body);
    const data     = await this._post(hostname, path, headers, body);
    return data.output?.message?.content?.[0]?.text || "";
  }

  async functionCall({ system, user, tools }) {
    const toolConfig = {
      tools: tools.map(t => ({
        toolSpec: {
          name: t.name, description: t.description,
          inputSchema: { json: { type: "object", properties: Object.fromEntries(Object.entries(t.schema || {}).map(([k, d]) => [k, { type: typeof d === "string" ? d : d.type || "string" }])), required: Object.entries(t.schema || {}).filter(([, d]) => typeof d === "string" ? true : d.required !== false).map(([k]) => k) } },
        },
      })),
    };
    const body = {
      modelId: this.model,
      system:  system ? [{ text: system }] : undefined,
      messages: [{ role: "user", content: [{ text: user }] }],
      inferenceConfig: { maxTokens: this.maxTokens, temperature: this.temperature },
      toolConfig,
    };
    const hostname = `bedrock-runtime.${this.region}.amazonaws.com`;
    const path     = `/model/${encodeURIComponent(this.model)}/converse`;
    const headers  = await this._signAWS("POST", hostname, path, body);
    const data     = await this._post(hostname, path, headers, body);
    const toolUse  = data.output?.message?.content?.find(c => c.toolUse);
    if (toolUse) return this._intent(toolUse.toolUse.name, toolUse.toolUse.input || {}, user);
    return this._unknown(user);
  }

  // AWS Signature V4 signing
  async _signAWS(method, hostname, path, body) {
    const crypto = require("crypto");
    const now    = new Date();
    const date   = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
    const dateShort = date.slice(0, 8);
    const payload    = JSON.stringify(body);
    const payloadHash = crypto.createHash("sha256").update(payload).digest("hex");
    const canonicalHeaders = `content-type:application/json\nhost:${hostname}\nx-amz-date:${date}\n${this.sessionToken ? `x-amz-security-token:${this.sessionToken}\n` : ""}`;
    const signedHeaders    = `content-type;host;x-amz-date${this.sessionToken ? ";x-amz-security-token" : ""}`;
    const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope  = `${dateShort}/${this.region}/bedrock/aws4_request`;
    const stringToSign     = `AWS4-HMAC-SHA256\n${date}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;
    const signingKey = [dateShort, this.region, "bedrock", "aws4_request"].reduce(
      (key, data) => crypto.createHmac("sha256", key).update(data).digest(), `AWS4${this.secretAccessKey}`
    );
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { Authorization: authHeader, "x-amz-date": date, ...(this.sessionToken ? { "x-amz-security-token": this.sessionToken } : {}) };
  }
}

// ── Mistral AI ────────────────────────────────────────────────────────────────

class MistralAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.MISTRAL_API_KEY;
    this.model  = opts.model  || "mistral-large-latest";
    if (!this.apiKey) throw new LLMConfigError("Mistral requires apiKey");
  }

  async complete({ system, user, format }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
    };
    const data = await this._post("api.mistral.ai", "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model, temperature: this.temperature,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post("api.mistral.ai", "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── Cohere ────────────────────────────────────────────────────────────────────

class CohereAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.COHERE_API_KEY;
    this.model  = opts.model  || "command-r-plus";
    if (!this.apiKey) throw new LLMConfigError("Cohere requires apiKey");
  }

  async complete({ system, user }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      preamble: system || undefined,
      chat_history: [],
      message: user,
    };
    const data = await this._post("api.cohere.com", "/v1/chat", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.text;
  }

  async functionCall({ system, user, tools }) {
    const cohereTools = tools.map(t => ({
      name: t.name, description: t.description,
      parameter_definitions: Object.fromEntries(
        Object.entries(t.schema || {}).map(([k, d]) => {
          const def = typeof d === "string" ? { type: d } : d;
          return [k, { description: def.description || k, type: def.type || "str", required: def.required !== false }];
        })
      ),
    }));
    const body = { model: this.model, message: user, preamble: system || undefined, tools: cohereTools, force_single_step: true };
    const data = await this._post("api.cohere.com", "/v1/chat", { Authorization: `Bearer ${this.apiKey}` }, body);
    if (data.tool_calls?.length) {
      const c = data.tool_calls[0];
      return this._intent(c.name, c.parameters || {}, user);
    }
    return this._unknown(user);
  }
}

// ── xAI Grok ──────────────────────────────────────────────────────────────────

class GrokAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.XAI_API_KEY;
    this.model  = opts.model  || "grok-2-latest";
    if (!this.apiKey) throw new LLMConfigError("xAI Grok requires apiKey");
  }

  async complete({ system, user, format }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
    };
    const data = await this._post("api.x.ai", "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post("api.x.ai", "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── Perplexity AI ─────────────────────────────────────────────────────────────

class PerplexityAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.PERPLEXITY_API_KEY;
    this.model  = opts.model  || "llama-3.1-sonar-large-128k-online";
    if (!this.apiKey) throw new LLMConfigError("Perplexity requires apiKey");
  }

  async complete({ system, user }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
    };
    const data = await this._post("api.perplexity.ai", "/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    // Perplexity uses OpenAI-compatible tool calling
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post("api.perplexity.ai", "/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── DeepSeek ──────────────────────────────────────────────────────────────────

class DeepSeekAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.DEEPSEEK_API_KEY;
    this.model  = opts.model  || "deepseek-chat";
    if (!this.apiKey) throw new LLMConfigError("DeepSeek requires apiKey");
  }

  async complete({ system, user, format }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
    };
    const data = await this._post("api.deepseek.com", "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post("api.deepseek.com", "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── Alibaba Qwen (DashScope) ──────────────────────────────────────────────────

class QwenAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.DASHSCOPE_API_KEY;
    this.model  = opts.model  || "qwen-max";
    if (!this.apiKey) throw new LLMConfigError("Qwen requires apiKey (DashScope)");
  }

  async complete({ system, user }) {
    const body = {
      model: this.model,
      input: { messages: [{ role: "system", content: system || "" }, { role: "user", content: user }] },
      parameters: { max_tokens: this.maxTokens, temperature: this.temperature, result_format: "message" },
    };
    const data = await this._post("dashscope.aliyuncs.com", "/api/v1/services/aigc/text-generation/generation", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.output?.choices?.[0]?.message?.content || data.output?.text || "";
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model,
      input: { messages: [{ role: "system", content: system || "" }, { role: "user", content: user }] },
      parameters: { max_tokens: this.maxTokens, temperature: this.temperature, result_format: "message",
        tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })) },
    };
    const data = await this._post("dashscope.aliyuncs.com", "/api/v1/services/aigc/text-generation/generation", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.output?.choices?.[0]?.message;
    if (msg?.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── Baidu ERNIE ───────────────────────────────────────────────────────────────

class ERNIEAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey    = opts.apiKey    || process.env.BAIDU_API_KEY;
    this.secretKey = opts.secretKey || process.env.BAIDU_SECRET_KEY;
    this.model     = opts.model     || "ernie-4.0-8k";
    this._token    = null;
    if (!this.apiKey || !this.secretKey) throw new LLMConfigError("ERNIE requires apiKey and secretKey");
  }

  async _getToken() {
    if (this._token) return this._token;
    const https = require("https");
    return new Promise((resolve, reject) => {
      const path = `/oauth/2.0/token?grant_type=client_credentials&client_id=${this.apiKey}&client_secret=${this.secretKey}`;
      https.get({ hostname: "aip.baidubce.com", path }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => { try { this._token = JSON.parse(d).access_token; resolve(this._token); } catch(e) { reject(e); } });
      }).on("error", reject);
    });
  }

  async complete({ system, user }) {
    const token = await this._getToken();
    const body  = { messages: [{ role: "user", content: system ? `${system}\n\n${user}` : user }], temperature: this.temperature, max_output_tokens: this.maxTokens };
    const data  = await this._post("aip.baidubce.com", `/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${this.model}?access_token=${token}`, {}, body);
    return data.result || "";
  }

  async functionCall({ system, user, tools }) {
    const token = await this._getToken();
    const body  = {
      messages: [{ role: "user", content: user }],
      system: system || undefined,
      functions: this._toOpenAIFunctions(tools),
      temperature: this.temperature,
    };
    const data = await this._post("aip.baidubce.com", `/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${this.model}?access_token=${token}`, {}, body);
    if (data.function_call) return this._intent(data.function_call.name, JSON.parse(data.function_call.arguments || "{}"), user);
    return this._unknown(user);
  }
}

// ── Hugging Face Inference API ────────────────────────────────────────────────

class HuggingFaceAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.HUGGINGFACE_API_KEY;
    this.model  = opts.model  || "meta-llama/Meta-Llama-3.1-70B-Instruct";
    if (!this.apiKey) throw new LLMConfigError("HuggingFace requires apiKey");
  }

  async complete({ system, user }) {
    const body = {
      model: this.model,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      max_tokens: this.maxTokens, temperature: this.temperature,
    };
    const data = await this._post("api-inference.huggingface.co", "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto", max_tokens: this.maxTokens,
    };
    const data = await this._post("api-inference.huggingface.co", "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── Ollama (local) ────────────────────────────────────────────────────────────

class OllamaAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.host  = opts.host  || process.env.OLLAMA_HOST || "localhost";
    this.port  = opts.port  || 11434;
    this.model = opts.model || "llama3.2";
  }

  async complete({ system, user }) {
    return new Promise((resolve, reject) => {
      const http    = require("http");
      const payload = JSON.stringify({ model: this.model, stream: false, messages: [{ role: "system", content: system || "" }, { role: "user", content: user }], options: { temperature: this.temperature, num_predict: this.maxTokens } });
      const req     = http.request({ hostname: this.host, port: this.port, path: "/api/chat", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => { try { resolve(JSON.parse(d).message?.content || ""); } catch(e) { reject(e); } });
      });
      req.on("error", reject); req.write(payload); req.end();
    });
  }

  async functionCall({ system, user, tools }) {
    return new Promise((resolve, reject) => {
      const http    = require("http");
      const payload = JSON.stringify({
        model: this.model, stream: false,
        messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
        tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      });
      const req = http.request({ hostname: this.host, port: this.port, path: "/api/chat", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => {
          try {
            const data = JSON.parse(d);
            const calls = data.message?.tool_calls;
            if (calls?.length) resolve(this._intent(calls[0].function.name, calls[0].function.arguments || {}, user));
            else resolve(this._unknown(user));
          } catch(e) { reject(e); }
        });
      });
      req.on("error", reject); req.write(payload); req.end();
    });
  }
}

// ── Together AI ───────────────────────────────────────────────────────────────

class TogetherAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.TOGETHER_API_KEY;
    this.model  = opts.model  || "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo";
    if (!this.apiKey) throw new LLMConfigError("Together AI requires apiKey");
  }

  async complete({ system, user, format }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
    };
    const data = await this._post("api.together.xyz", "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post("api.together.xyz", "/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── Groq ──────────────────────────────────────────────────────────────────────

class GroqAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.GROQ_API_KEY;
    this.model  = opts.model  || "llama-3.3-70b-versatile";
    if (!this.apiKey) throw new LLMConfigError("Groq requires apiKey");
  }

  async complete({ system, user, format }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
    };
    const data = await this._post("api.groq.com", "/openai/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post("api.groq.com", "/openai/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── Fireworks AI ──────────────────────────────────────────────────────────────

class FireworksAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.FIREWORKS_API_KEY;
    this.model  = opts.model  || "accounts/fireworks/models/llama-v3p1-70b-instruct";
    if (!this.apiKey) throw new LLMConfigError("Fireworks requires apiKey");
  }

  async complete({ system, user, format }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
    };
    const data = await this._post("api.fireworks.ai", "/inference/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post("api.fireworks.ai", "/inference/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── OpenRouter ────────────────────────────────────────────────────────────────
// Routes to any model: GPT, Claude, Gemini, LLaMA, Mistral, etc.

class OpenRouterAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY;
    this.model  = opts.model  || "openai/gpt-4o";
    this.siteUrl   = opts.siteUrl   || "https://munesoft.dev";
    this.siteName  = opts.siteName  || "Munesoft Agent Framework";
    if (!this.apiKey) throw new LLMConfigError("OpenRouter requires apiKey");
  }

  async complete({ system, user, format }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
    };
    const data = await this._post("openrouter.ai", "/api/v1/chat/completions",
      { Authorization: `Bearer ${this.apiKey}`, "HTTP-Referer": this.siteUrl, "X-Title": this.siteName }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post("openrouter.ai", "/api/v1/chat/completions",
      { Authorization: `Bearer ${this.apiKey}`, "HTTP-Referer": this.siteUrl, "X-Title": this.siteName }, body);
    const msg = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── AI21 Labs ─────────────────────────────────────────────────────────────────

class AI21Adapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.AI21_API_KEY;
    this.model  = opts.model  || "jamba-1.5-large";
    if (!this.apiKey) throw new LLMConfigError("AI21 requires apiKey");
  }

  async complete({ system, user }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
    };
    const data = await this._post("api.ai21.com", "/studio/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post("api.ai21.com", "/studio/v1/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

// ── NovitaAI ──────────────────────────────────────────────────────────────────

class NovitaAdapter extends BaseLLMAdapter {
  constructor(opts = {}) {
    super(opts);
    this.apiKey = opts.apiKey || process.env.NOVITA_API_KEY;
    this.model  = opts.model  || "meta-llama/llama-3.1-70b-instruct";
    if (!this.apiKey) throw new LLMConfigError("Novita requires apiKey");
  }

  async complete({ system, user, format }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
    };
    const data = await this._post("api.novita.ai", "/v3/openai/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    return data.choices[0].message.content;
  }

  async functionCall({ system, user, tools }) {
    const body = {
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: "system", content: system || "" }, { role: "user", content: user }],
      tools: this._toOpenAIFunctions(tools).map(f => ({ type: "function", function: f })),
      tool_choice: "auto",
    };
    const data = await this._post("api.novita.ai", "/v3/openai/chat/completions", { Authorization: `Bearer ${this.apiKey}` }, body);
    const msg  = data.choices[0].message;
    if (msg.tool_calls?.length) {
      const c = msg.tool_calls[0].function;
      return this._intent(c.name, JSON.parse(c.arguments || "{}"), user);
    }
    return this._unknown(user);
  }
}

module.exports = {
  OpenAIAdapter, ClaudeAdapter, GeminiAdapter, VertexAIAdapter,
  AzureOpenAIAdapter, BedrockAdapter, MistralAdapter, CohereAdapter,
  GrokAdapter, PerplexityAdapter, DeepSeekAdapter, QwenAdapter, ERNIEAdapter,
  HuggingFaceAdapter, OllamaAdapter, TogetherAdapter, GroqAdapter,
  FireworksAdapter, OpenRouterAdapter, AI21Adapter, NovitaAdapter,
};
