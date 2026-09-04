/**
 * Turns a web page or an uploaded document into knowledge the bot can answer
 * from.
 *
 * Retrieval works on passages, not whole pages: a single 40 KB page dumped
 * into the prompt buries the relevant sentence and wastes the model's context.
 * Sources are therefore split into overlapping chunks, and each chunk is
 * stored as its own row so lexical search can rank them independently.
 */

const MAX_FETCH_BYTES = 2 * 1024 * 1024;
const CHUNK_TARGET = 1200;
const CHUNK_OVERLAP = 150;

export interface ExtractedSource {
  title: string;
  text: string;
  url?: string;
}

/** Strips markup, scripts and boilerplate, leaving readable prose. */
export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim().slice(0, 200) : "";

  const text = html
    // Anything non-visible must go before tags are stripped, or its contents
    // end up in the output as plain text.
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, " ")
    // Block boundaries become newlines so sentences do not run together.
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return { title, text: cleanWhitespace(decodeEntities(text)) };
}

function decodeEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…",
  };
  return input
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function cleanWhitespace(input: string): string {
  return input
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Splits on paragraph boundaries where possible, so a chunk is a coherent
 * passage rather than a fixed-width slice through a sentence. Chunks overlap
 * slightly so an answer spanning a boundary is still retrievable.
 */
export function chunkText(text: string, target = CHUNK_TARGET, overlap = CHUNK_OVERLAP): string[] {
  const clean = cleanWhitespace(text);
  if (clean.length <= target) return clean ? [clean] : [];

  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > target) {
      push();
      // A single oversized paragraph still has to be broken up.
      for (let index = 0; index < paragraph.length; index += target - overlap) {
        chunks.push(paragraph.slice(index, index + target).trim());
      }
      continue;
    }
    if ((current + "\n\n" + paragraph).length > target) push();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  push();

  return chunks.filter((chunk) => chunk.length > 40);
}

/** Fetches a page and extracts its readable text. */
export async function fetchWebsiteContent(rawUrl: string): Promise<ExtractedSource> {
  let url: URL;
  try {
    url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new Error("That does not look like a valid web address.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https addresses can be imported.");
  }

  // Server-side fetch of a user-supplied URL: refuse anything that resolves to
  // the platform's own private network, so this cannot be used to read
  // internal services.
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host)
  ) {
    throw new Error("That address cannot be imported.");
  }

  const response = await fetch(url.toString(), {
    headers: {
      // Some sites serve a blank shell to unknown agents.
      "User-Agent": "Mozilla/5.0 (compatible; ChatbotKnowledgeBot/1.0)",
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) throw new Error(`The page returned HTTP ${response.status}.`);

  const contentType = response.headers.get("content-type") || "";
  if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
    throw new Error("Only web pages and plain text can be imported, not files of that type.");
  }

  const raw = await response.text();
  if (raw.length > MAX_FETCH_BYTES) throw new Error("That page is too large to import.");

  const extracted = /html/i.test(contentType) ? htmlToText(raw) : { title: "", text: cleanWhitespace(raw) };

  if (extracted.text.length < 80) {
    throw new Error(
      "No readable text was found. Pages that render entirely in the browser cannot be imported this way.",
    );
  }

  return {
    title: extracted.title || url.hostname + url.pathname,
    text: extracted.text,
    url: url.toString(),
  };
}

/** Extracts text from an uploaded document. */
export async function extractUploadedText(file: File): Promise<ExtractedSource> {
  const name = file.name || "document";
  const type = (file.type || "").toLowerCase();

  if (/text\/|json|csv|markdown/.test(type) || /\.(txt|md|csv|json)$/i.test(name)) {
    const text = cleanWhitespace(await file.text());
    if (text.length < 20) throw new Error("That file appears to be empty.");
    return { title: name, text };
  }

  if (/html/.test(type) || /\.html?$/i.test(name)) {
    const extracted = htmlToText(await file.text());
    return { title: extracted.title || name, text: extracted.text };
  }

  // Said plainly rather than failing with a parser error. PDF and Word need a
  // parser that is not installed; pasting the text works today.
  throw new Error(
    "Only .txt, .md, .csv, .json and .html files can be read directly. " +
      "For a PDF or Word file, copy the text and paste it in, or import the page from your website.",
  );
}
