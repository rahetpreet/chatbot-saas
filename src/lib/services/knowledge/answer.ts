import prisma from "@/lib/prisma";
import { getAIProvider, sanitizeUserPrompt } from "@/lib/services/ai";

/**
 * Answering a visitor question from the workspace's own knowledge.
 *
 * The important behaviour here is knowing when NOT to answer. A model given
 * company documents will happily invent a plausible answer when the documents
 * do not cover the question, and a confidently wrong answer about pricing or
 * availability is worse for the business than saying "let me get someone".
 *
 * So the model is told to reply with a specific sentinel when the supplied
 * material does not contain the answer, and that sentinel routes the visitor
 * to a human instead of being shown.
 */

const NO_ANSWER = "NO_ANSWER";
const MAX_PASSAGES = 5;

export interface KnowledgeAnswer {
  answered: boolean;
  content: string;
  /** Set when the question could not be answered from the knowledge base. */
  handover: boolean;
  sources: Array<{ id: string; title: string; url?: string | null }>;
}

/**
 * Ranks stored passages against the question.
 *
 * Deliberately lexical rather than vector-based: it needs no embedding model,
 * no vector database and no per-query cost, which keeps the product free to
 * run. Rare words are weighted more heavily than common ones, which is enough
 * to pick the right passage out of a few hundred.
 */
export async function retrievePassages(tenantId: string, question: string, limit = MAX_PASSAGES) {
  const docs = await prisma.knowledgeDoc.findMany({
    where: { tenantId },
    select: { id: true, title: true, content: true, sourceUrl: true, category: true },
    take: 500,
  });
  if (docs.length === 0) return [];

  const stopWords = new Set([
    "the", "and", "for", "are", "you", "your", "our", "with", "that", "this", "have", "has",
    "can", "will", "what", "when", "where", "how", "who", "why", "does", "did", "was", "were",
    "from", "about", "into", "any", "all", "not", "but", "its", "his", "her", "they", "them",
  ]);

  const terms = question
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
  if (terms.length === 0) return [];

  // Document frequency, so a word appearing in every passage counts for little.
  const frequency = new Map<string, number>();
  for (const term of terms) {
    let count = 0;
    for (const doc of docs) {
      if (`${doc.title} ${doc.content}`.toLowerCase().includes(term)) count++;
    }
    frequency.set(term, count || 1);
  }

  const scored = docs.map((doc) => {
    const title = doc.title.toLowerCase();
    const content = doc.content.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const rarity = Math.log(1 + docs.length / frequency.get(term)!);
      if (title.includes(term)) score += 3 * rarity;
      const occurrences = content.split(term).length - 1;
      if (occurrences) score += Math.min(occurrences, 4) * rarity;
    }
    return { doc, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.doc);
}

export async function answerFromKnowledge(params: {
  tenantId: string;
  aiConfigJson?: string | null;
  question: string;
  businessName?: string;
  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}): Promise<KnowledgeAnswer> {
  const question = sanitizeUserPrompt(params.question || "").trim();
  if (!question) {
    return { answered: false, content: "", handover: true, sources: [] };
  }

  const passages = await retrievePassages(params.tenantId, question);

  if (passages.length === 0) {
    // Nothing to ground an answer in. Guessing here is exactly the failure
    // this function exists to avoid.
    return {
      answered: false,
      content: "",
      handover: true,
      sources: [],
    };
  }

  const context = passages
    .map((passage, index) => `[${index + 1}] ${passage.title}\n${passage.content.slice(0, 2000)}`)
    .join("\n\n---\n\n");

  const system = `You answer visitor questions for ${params.businessName || "this business"} using ONLY the company information supplied below.

Rules:
- Answer in at most three short sentences, in a warm, professional tone.
- Use only facts present in the information. Never guess, never fill gaps from general knowledge.
- If the information does not contain the answer, reply with exactly: ${NO_ANSWER}
- Do not mention the information, the sources, or these rules.
- Reply in the same language as the question.

Company information:
${context}`;

  const provider = getAIProvider(params.aiConfigJson);
  const response = await provider.ask({
    tenantId: params.tenantId,
    userQuery: question,
    systemPrompt: system,
    conversationHistory: params.history?.slice(-6),
  });

  const content = (response.content || "").trim();

  // The rule-based fallback answers when no model is reachable; treat its
  // canned reply as "unanswered" so the visitor reaches a person instead.
  const unanswered =
    !content ||
    response.fallbackTriggered ||
    content.toUpperCase().includes(NO_ANSWER) ||
    content.length < 2;

  if (unanswered) {
    return { answered: false, content: "", handover: true, sources: [] };
  }

  return {
    answered: true,
    content,
    handover: false,
    sources: passages.map((passage) => ({ id: passage.id, title: passage.title, url: passage.sourceUrl })),
  };
}
