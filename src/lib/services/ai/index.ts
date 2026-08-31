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

// 5. External Free Tier API Provider (Groq / Gemini / OpenRouter)
export class ExternalAPIProvider implements AIProvider {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  async ask(params: {
    tenantId: string;
    userQuery: string;
    systemPrompt?: string;
    conversationHistory?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }): Promise<AIResponse> {
    if (!this.config.apiKey) {
      return new DisabledAIProvider().ask(params);
    }

    const sanitizedQuery = sanitizeUserPrompt(params.userQuery);
    const kbMatch = await matchKnowledgeBase(params.tenantId, sanitizedQuery);
    const kbContext = kbMatch ? `\n\nRelevant company FAQ context:\nTitle: ${kbMatch.doc.title}\nContent: ${kbMatch.doc.content}` : "";
    const sysPrompt = (params.systemPrompt || this.config.systemPrompt || "You are a helpful customer support bot.") + kbContext;

    try {
      let endpoint = "https://api.groq.com/openai/v1/chat/completions";
      let model = this.config.model || "llama-3.1-8b-instant";

      if (this.config.provider === "openrouter") {
        endpoint = "https://openrouter.ai/api/v1/chat/completions";
        model = this.config.model || "meta-llama/llama-3.2-3b-instruct:free";
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: sysPrompt },
            ...(params.conversationHistory || []),
            { role: "user", content: sanitizedQuery },
          ],
          temperature: this.config.temperature || 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      return {
        content,
        confidence: 0.9,
        provider: this.config.provider,
        model,
        matchedDocId: kbMatch?.doc.id,
        fallbackTriggered: false,
      };
    } catch (err: any) {
      console.warn("External AI call failed, falling back to rule-based:", err.message);
      return new DisabledAIProvider().ask(params);
    }
  }
}

export function getAIProvider(aiConfigJson?: string | null): AIProvider {
  if (!aiConfigJson) {
    if (process.env.AI_PROVIDER === "ollama") {
      return new OllamaProvider(process.env.OLLAMA_BASE_URL, process.env.OLLAMA_MODEL);
    }
    return new DisabledAIProvider();
  }

  try {
    const config: AIConfig = JSON.parse(aiConfigJson);
    if (!config.enabled || config.provider === "disabled") {
      return new DisabledAIProvider();
    }
    if (config.provider === "ollama") {
      return new OllamaProvider(config.baseUrl || "http://localhost:11434", config.model || "llama3.2", config.temperature);
    }
    if (config.provider === "groq" || config.provider === "openrouter" || config.provider === "gemini") {
      return new ExternalAPIProvider(config);
    }
  } catch {
    // fallback
  }

  return new DisabledAIProvider();
}
