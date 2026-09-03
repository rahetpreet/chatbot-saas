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
  buildBody(model: string, system: string, history: ChatMessage[], query: string, temperature: number): unknown;
  buildHeaders(apiKey: string): Record<string, string>;
  extract(payload: any): string;
}

const HOSTED_PROVIDERS: Record<string, HostedProviderSpec> = {
  // Google AI Studio. Free key at https://aistudio.google.com/apikey
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    defaultModel: "gemini-2.0-flash",
    buildHeaders: () => ({ "Content-Type": "application/json" }),
    buildBody: (_model, system, history, query, temperature) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        ...history.map((message) => ({
          // Gemini has no "assistant" role; model replies are "model".
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        { role: "user", parts: [{ text: query }] },
      ],
      generationConfig: { temperature, maxOutputTokens: 4096 },
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
    defaultModel: "llama-3.3-70b-versatile",
    buildHeaders: (apiKey) => ({ "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }),
    buildBody: (model, system, history, query, temperature) => ({
      model,
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: query }],
      temperature,
    }),
    extract: (payload) => payload?.choices?.[0]?.message?.content?.trim() || "",
  },
  // Free key at https://openrouter.ai/keys
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    buildHeaders: (apiKey) => ({ "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }),
    buildBody: (model, system, history, query, temperature) => ({
      model,
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: query }],
      temperature,
    }),
    extract: (payload) => payload?.choices?.[0]?.message?.content?.trim() || "",
  },
};

export const SUPPORTED_AI_PROVIDERS = Object.keys(HOSTED_PROVIDERS);

export class HostedAIProvider implements AIProvider {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  private urlFor(model: string, spec: HostedProviderSpec): string {
    return this.config.provider === "gemini"
      ? `${spec.endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.config.apiKey || "")}`
      : spec.endpoint;
  }

  /** Raw completion with no knowledge-base injection. Used by flow generation. */
  async complete(params: { system: string; user: string; temperature?: number }): Promise<string> {
    const spec = HOSTED_PROVIDERS[this.config.provider];
    if (!spec || !this.config.apiKey) throw new Error("AI provider is not configured.");

    const model = this.config.model || spec.defaultModel;
    const temperature = params.temperature ?? this.config.temperature ?? 0.7;

    const response = await fetch(this.urlFor(model, spec), {
      method: "POST",
      headers: spec.buildHeaders(this.config.apiKey),
      body: JSON.stringify(spec.buildBody(model, params.system, [], params.user, temperature)),
      // Flow generation is interactive; a stalled provider must not hang the
      // request until the platform's own timeout.
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${this.config.provider} HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
    return spec.extract(await response.json());
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
          spec.buildBody(model, system, params.conversationHistory || [], sanitizedQuery, this.config.temperature ?? 0.7),
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
export function getPlatformAIConfig(): AIConfig | null {
  const provider = (process.env.AI_PROVIDER || "disabled").toLowerCase();
  if (provider === "disabled") return null;

  if (provider === "ollama") {
    return {
      enabled: true,
      provider: "ollama",
      model: process.env.OLLAMA_MODEL || "llama3.2",
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      systemPrompt: "",
      temperature: 0.7,
      confidenceThreshold: 0.6,
    };
  }

  const apiKey = process.env.AI_API_KEY || process.env.EXTERNAL_AI_API_KEY;
  if (!HOSTED_PROVIDERS[provider] || !apiKey) return null;

  return {
    enabled: true,
    provider: provider as AIConfig["provider"],
    model: process.env.AI_MODEL || HOSTED_PROVIDERS[provider].defaultModel,
    apiKey,
    systemPrompt: "",
    temperature: 0.7,
    confidenceThreshold: 0.6,
  };
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
export function getGenerationProvider(aiConfigJson?: string | null): HostedAIProvider | null {
  const candidates: (AIConfig | null)[] = [];
  if (aiConfigJson) {
    try {
      const config: AIConfig = JSON.parse(aiConfigJson);
      if (config.provider !== "disabled" && config.apiKey && HOSTED_PROVIDERS[config.provider]) candidates.push(config);
    } catch {
      /* ignore malformed configuration */
    }
  }
  candidates.push(getPlatformAIConfig());

  for (const candidate of candidates) {
    if (candidate?.apiKey && HOSTED_PROVIDERS[candidate.provider]) return new HostedAIProvider(candidate);
  }
  return null;
}

