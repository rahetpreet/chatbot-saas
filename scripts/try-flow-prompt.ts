/**
 * Runs a flow-generation prompt through the real model and prints the graph.
 *
 * Use it to see what a customer's description actually produces before
 * shipping a prompt change:
 *
 *   npx tsx scripts/try-flow-prompt.ts "we run a maths tuition centre for class 9-12"
 *
 * Reads AI_PROVIDER / AI_API_KEY from .env.vercel, falling back to .env.
 * Nothing is written to the database.
 */
import { readFileSync, existsSync } from "node:fs";

function loadEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

// Loaded before importing the AI module, which reads these at call time.
// Values already set on the command line win, so a single provider or model
// can be tested without editing the files.
const fileEnv = { ...loadEnv(".env"), ...loadEnv(".env.vercel") };
for (const [key, value] of Object.entries(fileEnv)) {
  if (!process.env[key]) process.env[key] = value;
}

const prompt = process.argv.slice(2).join(" ").trim();
const business = process.env.BUSINESS_NAME || "Acme";

if (!prompt) {
  console.error('Usage: npx tsx scripts/try-flow-prompt.ts "describe the business"');
  process.exit(1);
}

async function main() {
  const { FLOW_SYSTEM_PROMPT, buildFlowUserPrompt, extractJsonObject, normalizeGeneratedGraph } = await import(
    "../src/lib/services/flow/aiGenerator"
  );
  const { getGenerationProvider } = await import("../src/lib/services/ai");

  const provider = getGenerationProvider(null);
  if (!provider) {
    console.error("No generation provider resolved. Check AI_PROVIDER and AI_API_KEY.");
    process.exit(1);
  }

  const started = Date.now();
  const completion = await provider.complete({
    system: FLOW_SYSTEM_PROMPT,
    temperature: 0.4,
    json: true,
    user: buildFlowUserPrompt(prompt, business),
  });

  const graph = normalizeGeneratedGraph(extractJsonObject(completion));

  if (!graph) {
    console.log("Model output could not be validated. Raw reply:\n");
    console.log(completion.slice(0, 2000));
    process.exit(1);
  }

  console.log(`generated in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  console.log(`Flow name:   ${graph.name}`);
  console.log(`Description: ${graph.description}\n`);
  console.log(`NODES (${graph.nodes.length}):`);
  for (const node of graph.nodes) {
    const d: any = node.data;
    let detail = d.messageText || d.closingMessage || d.handoverMessage || "";
    if (d.options) detail = d.options.map((o: any) => o.label).join(" | ");
    if (d.nodeType === "input") detail = `[${d.inputType}:${d.inputKey}] ${d.messageText || ""}`;
    console.log(`  ${String(node.id).padEnd(16)} ${String(d.nodeType).padEnd(10)} ${String(detail).slice(0, 100)}`);
  }
  console.log(`\nEDGES (${graph.edges.length}):`);
  for (const edge of graph.edges) {
    console.log(`  ${edge.source} -> ${edge.target}${edge.sourceHandle ? `  [${edge.sourceHandle}]` : ""}`);
  }

}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
