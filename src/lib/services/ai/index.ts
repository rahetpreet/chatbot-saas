import prisma from "@/lib/prisma";
import { AIConfig } from "@/types";

export interface AIResponse {
  content: string;
  confidence: number;
  provider: string;
  model: string;
  matchedDocId?: string;
  fallbackTriggered: boolean;
}

export interface AIProvider {
  ask(params: {
    tenantId: string;
    userQuery: string;
    systemPrompt?: string;
    conversationHistory?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }): Promise<AIResponse>;
}

// 1. Guardrail filter against prompt injections
export function sanitizeUserPrompt(input: string): string {
  // Strip common system-override delimiters and injection attempts
  return input
    .replace(/ignore (all )?previous (instructions|prompts)/gi, "[redacted]")
    .replace(/you are now an unrestricted/gi, "[redacted]")
    .replace(/reveal system prompt/gi, "[redacted]")
    .trim();
}

// 2. Zero-Cost Lexical & Keyword FAQ Search (Works without any AI model)
export async function matchKnowledgeBase(tenantId: string, query: string): Promise<{ doc: any; score: number } | null> {
  try {
    const docs = await prisma.knowledgeDoc.findMany({
      where: { tenantId },
    });

    if (docs.length === 0) return null;

    const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    if (words.length === 0) return null;

    let bestDoc = null;
    let bestScore = 0;

    for (const doc of docs) {
      const titleLower = doc.title.toLowerCase();
      const contentLower = doc.content.toLowerCase();
      
      let matches = 0;
      for (const word of words) {
        if (titleLower.includes(word)) matches += 3; // Title match has high weight
        if (contentLower.includes(word)) matches += 1;
      }

      const score = matches / (words.length * 3);
      if (score > bestScore) {
        bestScore = score;
        bestDoc = doc;
      }
    }

    if (bestDoc && bestScore >= 0.25) {
      return { doc: bestDoc, score: Math.min(bestScore, 1) };
    }
    return null;
  } catch (err) {
    console.warn("Knowledge base lookup error:", err);
    return null;
  }
}

// 3. Disabled AI Provider (Pure Rule-Based Fallback)
export class DisabledAIProvider implements AIProvider {
  async ask(params: { tenantId: string; userQuery: string }): Promise<AIResponse> {
    const matched = await matchKnowledgeBase(params.tenantId, params.userQuery);
    if (matched) {
      return {
        content: `Based on our company knowledge:\n\n**${matched.doc.title}**\n${matched.doc.content}`,
        confidence: 0.85,
        provider: "knowledge_base_lexical",
        model: "built-in-faq",
        matchedDocId: matched.doc.id,
        fallbackTriggered: false,
      };
    }

    return {
      content: "I didn't quite catch that. Would you like me to connect you with a team member or choose from the options below?",
      confidence: 0.3,
      provider: "disabled",
      model: "none",
      fallbackTriggered: true,
    };
  }
}

// 4. Local Ollama Provider (100% Free Local AI)
export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private model: string;
  private temperature: number;

  constructor(baseUrl = "http://localhost:11434", model = "llama3.2", temperature = 0.7) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.temperature = temperature;
  }

  async ask(params: {
    tenantId: string;
    userQuery: string;
    systemPrompt?: string;
    conversationHistory?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }): Promise<AIResponse> {
    const sanitizedQuery = sanitizeUserPrompt(params.userQuery);

    // First, check local knowledge base for context
    const kbMatch = await matchKnowledgeBase(params.tenantId, sanitizedQuery);
    const kbContext = kbMatch ? `\n\nRelevant company FAQ context:\nTitle: ${kbMatch.doc.title}\nContent: ${kbMatch.doc.content}` : "";

    const defaultSystem = `You are a helpful, professional customer service assistant. Answer accurately based on the context. If you do not know, politely offer to connect with human support.${kbContext}`;
    const sysPrompt = (params.systemPrompt || defaultSystem) + kbContext;

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: sysPrompt },
            ...(params.conversationHistory || []),
            { role: "user", content: sanitizedQuery },
          ],
          stream: false,
          options: { temperature: this.temperature },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.message?.content || "";

      return {
        content,
        confidence: 0.88,
        provider: "ollama",
        model: this.model,
        matchedDocId: kbMatch?.doc.id,
        fallbackTriggered: false,
      };
    } catch (err: any) {
      console.warn("Ollama inference failed, falling back to rule-based:", err.message);
      return new DisabledAIProvider().ask(params);
    }
  }
}

// 5. Hosted provider (Gemini / Groq / OpenRouter)
//
// All three have a usable free tier. Gemini and Groq are the two worth
// recommending: Gemini for quality, Groq for latency. OpenRouter is kept
// because its ":free" model slugs need no billing setup at all.

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

interface HostedProviderSpec {
  endpoint: string;
  defaultModel: string;
  /** Ordered fallbacks, best first, used when the chosen model is gone. */
  preferredModels: string[];
  /** Lists the models this key can actually use. */
  modelsUrl(apiKey: string): string;
  extractModels(payload: any): string[];
  buildBody(
    model: string,
    system: string,
    history: ChatMessage[],
    query: string,
    temperature: number,
    json: boolean,
  ): unknown;
  buildHeaders(apiKey: string): Record<string, string>;
  extract(payload: any): string;
}

/**
 * Generous, because current Gemini and Groq models spend output tokens on
 * internal reasoning before writing anything. A flow graph plus that reasoning
 * did not fit in 4096, so replies came back truncated mid-JSON and were
 * discarded as invalid — which looked exactly like the AI producing nonsense.
 */
const MAX_OUTPUT_TOKENS = 16384;

const HOSTED_PROVIDERS: Record<string, HostedProviderSpec> = {
  // Google AI Studio. Free key at https://aistudio.google.com/apikey
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    // A floating alias rather than a pinned version. Google retires numbered
    // Gemini models, and gemini-2.0-flash had already started returning 404
    // "no longer available" -- a pinned default silently breaks AI for every
    // workspace the day it is retired.
    defaultModel: "gemini-flash-latest",
    preferredModels: ["gemini-flash-latest", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-flash-lite-latest"],
    modelsUrl: (apiKey) =>
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`,
    extractModels: (payload) =>
      (payload?.models || [])
        .filter((model: any) => (model?.supportedGenerationMethods || []).includes("generateContent"))
        .map((model: any) => String(model.name || "").split("/").pop() || "")
        .filter(Boolean),
    buildHeaders: () => ({ "Content-Type": "application/json" }),
    buildBody: (_model, system, history, query, temperature, json) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        ...history.map((message) => ({
          // Gemini has no "assistant" role; model replies are "model".
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        { role: "user", parts: [{ text: query }] },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Constrained decoding is far more reliable than asking for JSON in
        // the prompt: the model cannot emit prose or code fences at all.
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    }),
    extract: (payload) =>
      (payload?.candidates?.[0]?.content?.parts || [])
        .map((part: any) => part?.text || "")
        .join("")
        .trim(),
  },
  // Free key at https://console.groq.com/keys
  groq: {
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    // Groq retired the Llama line; these are what a current free key can use.
    defaultModel: "openai/gpt-oss-120b",
    preferredModels: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "qwen/qwen3.6-27b"],
    modelsUrl: () => "https://api.groq.com/openai/v1/models",
    extractModels: (payload) => (payload?.data || []).map((model: any) => String(model.id)).filter(Boolean),
    buildHeaders: (apiKey) => ({ "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }),
    buildBody: (model, system, history, query, temperature, json) => ({
      model,
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: query }],
      temperature,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    extract: (payload) => payload?.choices?.[0]?.message?.content?.trim() || "",
  },
  // Free key at https://openrouter.ai/keys
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    preferredModels: [
      "meta-llama/llama-3.3-70b-instruct:free",
      "qwen/qwen-2.5-72b-instruct:free",
      "google/gemma-2-9b-it:free",
    ],
    modelsUrl: () => "https://openrouter.ai/api/v1/models",
    extractModels: (payload) => (payload?.data || []).map((model: any) => String(model.id)).filter(Boolean),
    buildHeaders: (apiKey) => ({ "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }),
    buildBody: (model, system, history, query, temperature, json) => ({
      model,
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: query }],
      temperature,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    extract: (payload) => payload?.choices?.[0]?.message?.content?.trim() || "",
  },
};

export const SUPPORTED_AI_PROVIDERS = Object.keys(HOSTED_PROVIDERS);

/** Load-shedding and rate limiting, as opposed to a request that is just wrong. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Model names rot.
 *
 * Providers retire models on their own schedule and without warning: Gemini
 * started returning 404 "gemini-2.0-flash is no longer available", and Groq
 * dropped the entire Llama line, both while this was being built. A pinned
 * model name is therefore a scheduled outage — and worse, a silent one, since
 * the app just falls back to keyword templates.
 *
 * So a "model not found" is treated as recoverable: ask the provider what this
 * key can actually use, pick the best match, and carry on. The answer is
 * cached per key so it costs one extra request, once.
 */
const MODEL_MISSING = /model[_ ]?not[_ ]?found|no longer available|is not found|does not exist|unknown model/i;

const resolvedModelCache = new Map<string, string>();

async function discoverModel(provider: string, spec: HostedProviderSpec, apiKey: string): Promise<string | null> {
  const cacheKey = `${provider}:${apiKey.slice(-8)}`;
  const cached = resolvedModelCache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(spec.modelsUrl(apiKey), {
      headers: spec.buildHeaders(apiKey),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;

    const available = new Set(spec.extractModels(await response.json()));
    if (available.size === 0) return null;

    // Prefer a known-good model; otherwise take any chat-capable one rather
    // than failing outright.
    const chosen =
      spec.preferredModels.find((model) => available.has(model)) ||
      [...available].find((model) => !/whisper|tts|embed|guard|moderation|vision|image/i.test(model)) ||
      null;

    if (chosen) {
      resolvedModelCache.set(cacheKey, chosen);
      console.warn(`[ai] ${provider}: configured model unavailable, using "${chosen}" instead.`);
    }
    return chosen;
  } catch (error) {
    console.warn(`[ai] ${provider}: could not list models:`, error);
    return null;
  }
}
const RETRYABLE_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [800, 2200];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HostedAIProvider implements AIProvider {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  /** Provider and model, for logs and the system check. */
  get providerName(): string {
    return this.config.provider + ":" + (this.config.model || HOSTED_PROVIDERS[this.config.provider]?.defaultModel || "?");
  }

  private urlFor(model: string, spec: HostedProviderSpec): string {
    return this.config.provider === "gemini"
      ? `${spec.endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.config.apiKey || "")}`
      : spec.endpoint;
  }

  /**
   * Raw completion with no knowledge-base injection. Used by flow generation.
   *
   * Free tiers rate-limit and shed load: Gemini in particular returns 503
   * "experiencing high demand" fairly often. A single attempt meant one busy
   * moment silently dropped the request to the rule-based fallback, which
   * produced a plausible-looking but wrong flow with no indication why. These
   * statuses are retried with backoff; genuine errors (a bad key, an unknown
   * model) are not, because retrying those only wastes the caller's time.
   */
  async complete(params: { system: string; user: string; temperature?: number; json?: boolean }): Promise<string> {
    const spec = HOSTED_PROVIDERS[this.config.provider];
    if (!spec || !this.config.apiKey) throw new Error("AI provider is not configured.");

    let model = this.config.model || spec.defaultModel;
    const temperature = params.temperature ?? this.config.temperature ?? 0.7;
    const buildBody = () =>
      JSON.stringify(spec.buildBody(model, params.system, [], params.user, temperature, params.json ?? false));

    let lastError = "";
    let rediscovered = false;

    for (let attempt = 0; attempt < RETRYABLE_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]);

      try {
        const response = await fetch(this.urlFor(model, spec), {
          method: "POST",
          headers: spec.buildHeaders(this.config.apiKey),
          body: buildBody(),
          // Flow generation is interactive; a stalled provider must not hang
          // the request until the platform's own timeout.
          signal: AbortSignal.timeout(45_000),
        });

        if (response.ok) return spec.extract(await response.json());

        const detail = await response.text().catch(() => "");
        lastError = `${this.config.provider} HTTP ${response.status}: ${detail.slice(0, 300)}`;

        // A retired model is not a transient failure, but it is recoverable:
        // find one this key can still use and try again rather than dropping
        // to the keyword fallback.
        if (!rediscovered && MODEL_MISSING.test(detail)) {
          rediscovered = true;
          const replacement = await discoverModel(this.config.provider, spec, this.config.apiKey);
          if (replacement && replacement !== model) {
            model = replacement;
            continue;
          }
        }

        if (!RETRYABLE_STATUSES.has(response.status)) throw new Error(lastError);
        console.warn(`[ai] ${lastError} — retrying (${attempt + 1}/${RETRYABLE_ATTEMPTS})`);
      } catch (error: any) {
        // A timeout or dropped connection is worth another go; anything else
        // has already been classified as fatal above.
        const transient = error?.name === "TimeoutError" || error?.name === "AbortError" || RETRYABLE_STATUSES.has(0);
        lastError = error?.message || String(error);
        if (!transient && !lastError.includes("HTTP")) throw error;
        if (!transient) throw error;
        console.warn(`[ai] ${lastError} — retrying (${attempt + 1}/${RETRYABLE_ATTEMPTS})`);
      }
    }

    throw new Error(lastError || "AI request failed after retries.");
  }

  async ask(params: {
    tenantId: string;
    userQuery: string;
    systemPrompt?: string;
    conversationHistory?: ChatMessage[];
  }): Promise<AIResponse> {
    const spec = HOSTED_PROVIDERS[this.config.provider];
    if (!spec || !this.config.apiKey) return new DisabledAIProvider().ask(params);

    const sanitizedQuery = sanitizeUserPrompt(params.userQuery);
    const kbMatch = await matchKnowledgeBase(params.tenantId, sanitizedQuery);
    const kbContext = kbMatch
      ? `\n\nUse this company knowledge when relevant:\nTitle: ${kbMatch.doc.title}\nContent: ${kbMatch.doc.content}`
      : "";
    const system =
      (params.systemPrompt ||
        this.config.systemPrompt ||
        "You are a helpful customer support assistant. Answer briefly and accurately. If you do not know, offer to connect the visitor with a team member.") + kbContext;

    const model = this.config.model || spec.defaultModel;
    try {
      const response = await fetch(this.urlFor(model, spec), {
        method: "POST",
        headers: spec.buildHeaders(this.config.apiKey),
        body: JSON.stringify(
          spec.buildBody(model, system, params.conversationHistory || [], sanitizedQuery, this.config.temperature ?? 0.7, false),
        ),
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) throw new Error(`${this.config.provider} HTTP ${response.status}`);
      const content = spec.extract(await response.json());
      if (!content) throw new Error("empty completion");

      return {
        content,
        confidence: 0.9,
        provider: this.config.provider,
        model,
        matchedDocId: kbMatch?.doc.id,
        fallbackTriggered: false,
      };
    } catch (error: any) {
      console.warn(`[ai] ${this.config.provider} call failed, using rule-based fallback:`, error?.message);
      return new DisabledAIProvider().ask(params);
    }
  }
}

/** Kept so existing imports keep working. */
export const ExternalAPIProvider = HostedAIProvider;

/**
 * Platform-level AI configuration from environment variables. This is what
 * makes AI work out of the box for every workspace: the operator supplies one
 * free key instead of each client bringing their own.
 */
/** Per-provider key, so several can be configured at once for failover. */
const PROVIDER_KEY_ENV: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

function hostedConfig(provider: string, apiKey: string, model?: string): AIConfig {
  return {
    enabled: true,
    provider: provider as AIConfig["provider"],
    model: model || HOSTED_PROVIDERS[provider].defaultModel,
    apiKey,
    systemPrompt: "",
    temperature: 0.7,
    confidenceThreshold: 0.6,
  };
}

/**
 * Every platform provider that is configured, in the order they should be
 * tried.
 *
 * Free tiers shed load: Gemini returned "experiencing high demand" repeatedly
 * during testing, and a single provider meant one busy spell silently dropped
 * flow generation to the keyword fallback. Configuring a second provider makes
 * that a non-event.
 *
 * AI_PROVIDER + AI_API_KEY names the preferred one; GEMINI_API_KEY,
 * GROQ_API_KEY and OPENROUTER_API_KEY add backups.
 */
export function getPlatformAIConfigs(): AIConfig[] {
  const preferred = (process.env.AI_PROVIDER || "disabled").toLowerCase();
  if (preferred === "disabled") return [];

  if (preferred === "ollama") {
    return [
      {
        enabled: true,
        provider: "ollama",
        model: process.env.OLLAMA_MODEL || "llama3.2",
        baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
        systemPrompt: "",
        temperature: 0.7,
        confidenceThreshold: 0.6,
      },
    ];
  }

  const configs: AIConfig[] = [];
  const seen = new Set<string>();

  const primaryKey =
    process.env.AI_API_KEY ||
    process.env.EXTERNAL_AI_API_KEY ||
    (PROVIDER_KEY_ENV[preferred] ? process.env[PROVIDER_KEY_ENV[preferred]] : undefined);

  if (HOSTED_PROVIDERS[preferred] && primaryKey) {
    configs.push(hostedConfig(preferred, primaryKey, process.env.AI_MODEL));
    seen.add(preferred);
  }

  for (const [provider, envName] of Object.entries(PROVIDER_KEY_ENV)) {
    if (seen.has(provider)) continue;
    const key = process.env[envName];
    if (key) {
      configs.push(hostedConfig(provider, key));
      seen.add(provider);
    }
  }

  return configs;
}

/** The preferred provider only. Kept for callers that want a single config. */
export function getPlatformAIConfig(): AIConfig | null {
  return getPlatformAIConfigs()[0] ?? null;
}

function providerFromConfig(config: AIConfig): AIProvider {
  if (config.provider === "ollama") {
    return new OllamaProvider(config.baseUrl || "http://localhost:11434", config.model || "llama3.2", config.temperature);
  }
  if (HOSTED_PROVIDERS[config.provider]) return new HostedAIProvider(config);
  return new DisabledAIProvider();
}

/**
 * Resolves the provider for a workspace: its own configuration first, then the
 * platform key, then the rule-based fallback. A workspace that has explicitly
 * turned AI off is always honoured.
 */
export function getAIProvider(aiConfigJson?: string | null): AIProvider {
  if (aiConfigJson) {
    try {
      const config: AIConfig = JSON.parse(aiConfigJson);
      if (config.enabled === false || config.provider === "disabled") return new DisabledAIProvider();
      if (config.apiKey || config.provider === "ollama") return providerFromConfig(config);

      // Enabled but with no key of its own: use the platform key while keeping
      // the workspace's own system prompt and temperature.
      const platform = getPlatformAIConfig();
      if (platform) {
        return providerFromConfig({
          ...platform,
          systemPrompt: config.systemPrompt || platform.systemPrompt,
          temperature: config.temperature ?? platform.temperature,
          model: config.model || platform.model,
        });
      }
      return new DisabledAIProvider();
    } catch {
      /* fall through to the platform default */
    }
  }

  const platform = getPlatformAIConfig();
  return platform ? providerFromConfig(platform) : new DisabledAIProvider();
}

/** True when a real model is reachable, rather than the rule-based fallback. */
export function isAIAvailable(aiConfigJson?: string | null): boolean {
  return !(getAIProvider(aiConfigJson) instanceof DisabledAIProvider);
}

/**
 * A provider capable of raw completions, for flow generation. Prefers the
 * workspace's own key and falls back to the platform key.
 */
export function getGenerationProviders(aiConfigJson?: string | null): HostedAIProvider[] {
  const candidates: AIConfig[] = [];

  if (aiConfigJson) {
    try {
      const config: AIConfig = JSON.parse(aiConfigJson);
      if (config.provider !== "disabled" && config.apiKey && HOSTED_PROVIDERS[config.provider]) candidates.push(config);
    } catch {
      /* ignore malformed configuration */
    }
  }

  // Platform providers come after the workspace's own, and a provider already
  // present is not repeated -- retrying the same busy endpoint is pointless.
  const seen = new Set(candidates.map((config) => config.provider));
  for (const config of getPlatformAIConfigs()) {
    if (config.provider === "ollama" || seen.has(config.provider)) continue;
    candidates.push(config);
    seen.add(config.provider);
  }

  return candidates.map((config) => new HostedAIProvider(config));
}

/** The first usable generation provider, or null when none is configured. */
export function getGenerationProvider(aiConfigJson?: string | null): HostedAIProvider | null {
  return getGenerationProviders(aiConfigJson)[0] ?? null;
}

/** Which provider a HostedAIProvider will call, for logging and diagnostics. */
export function describeProvider(provider: HostedAIProvider): string {
  return provider.providerName;
}

