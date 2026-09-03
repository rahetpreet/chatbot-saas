import { FlowNodeData } from "@/types";
import { getGenerationProvider } from "@/lib/services/ai";

export interface GeneratedGraph {
  name: string;
  description: string;
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: FlowNodeData }>;
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; label?: string }>;
}

const SUPPORTED_NODE_TYPES = new Set([
  "start", "message", "buttons", "input", "attachment",
  "condition", "webhook", "ai_fallback", "handover", "close",
]);

export const FLOW_SYSTEM_PROMPT = `You design conversational chatbot flows as directed graphs.

You MUST reply with a single JSON object and nothing else. No prose, no markdown, no code fences.

Schema:
{
  "name": string,
  "description": string,
  "nodes": [ { "id": string, "type": NodeType, "position": {"x": number, "y": number}, "data": object } ],
  "edges": [ { "id": string, "source": string, "target": string, "sourceHandle"?: string } ]
}

NodeType is one of: start, message, buttons, input, attachment, condition, webhook, ai_fallback, handover, close.

data fields by type:
- start:    { "label": string, "nodeType": "start" }
- message:  { "label": string, "nodeType": "message", "messageText": string }
- buttons:  { "label": string, "nodeType": "buttons", "messageText": string, "inputKey": string,
              "options": [ { "id": "opt-1", "label": string, "value": string } ] }
- input:    { "label": string, "nodeType": "input", "inputType": "text"|"email"|"phone"|"name"|"number",
              "inputKey": string, "inputPlaceholder": string, "required": boolean, "messageText": string }
- condition:{ "label": string, "nodeType": "condition",
              "conditions": [ { "id": "cond-1", "variable": string, "operator": "equals", "value": string } ] }
- handover: { "label": string, "nodeType": "handover", "handoverMessage": string }
- close:    { "label": string, "nodeType": "close", "closingMessage": string, "resolveSession": true }

Hard rules:
1. Exactly one start node.
2. Every edge source and target must be an existing node id.
3. Every buttons node needs at least one option, and each option needs a unique id like "opt-1".
4. To branch from a specific button, set the edge "sourceHandle" to that option's id.
5. Every input node needs a non-empty snake_case inputKey.
6. Lay the graph out top to bottom: x between 60 and 700, y increasing by about 140 per level.
7. End every branch at a close or handover node.
8. Write the copy in the same language as the request. Use the real brand name, real products
   and real services named in the request. Be specific, never generic placeholders.`;

interface NormalizedGraph extends GeneratedGraph {}

/**
 * Repairs and validates a model-generated graph.
 *
 * Models reliably produce the right shape but not always a *valid* graph, and
 * publishing refuses an invalid one. Rather than rejecting the generation and
 * losing the useful copy, obvious problems are repaired and anything still
 * broken is rejected so the deterministic compiler can take over.
 */
export function normalizeGeneratedGraph(raw: any): NormalizedGraph | null {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;

  const seen = new Set<string>();
  const nodes = raw.nodes
    .filter((node: any) => node && typeof node.id === "string" && node.id.trim())
    .filter((node: any) => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    })
    .map((node: any, index: number) => {
      const data = typeof node.data === "object" && node.data ? { ...node.data } : {};
      const type = SUPPORTED_NODE_TYPES.has(data.nodeType) ? data.nodeType
        : SUPPORTED_NODE_TYPES.has(node.type) ? node.type
        : "message";

      data.nodeType = type;
      if (typeof data.label !== "string" || !data.label.trim()) data.label = type;

      if (type === "buttons") {
        const options = Array.isArray(data.options) ? data.options : [];
        data.options = options
          .filter((option: any) => option && (option.label || option.value))
          .map((option: any, i: number) => ({
            id: typeof option.id === "string" && option.id.trim() ? option.id : `opt-${i + 1}`,
            label: String(option.label || option.value),
            value: String(option.value || option.label).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30),
          }));
        if (data.options.length === 0) return null;
        if (typeof data.inputKey !== "string" || !data.inputKey.trim()) data.inputKey = "choice";
      }

      if (type === "input" && (typeof data.inputKey !== "string" || !data.inputKey.trim())) {
        // Publishing rejects an input node without a key, and a generated flow
        // that cannot be published is worse than no generation at all.
        data.inputKey = `field_${index + 1}`;
      }

      const position = node.position && typeof node.position === "object" ? node.position : {};
      return {
        id: node.id,
        type,
        position: {
          x: Number.isFinite(Number(position.x)) ? Number(position.x) : 300,
          y: Number.isFinite(Number(position.y)) ? Number(position.y) : 60 + index * 140,
        },
        data,
      };
    })
    .filter(Boolean);

  if (nodes.length < 2) return null;

  const ids = new Set(nodes.map((node: any) => node.id));

  // Exactly one start node, repaired rather than rejected.
  const starts = nodes.filter((node: any) => node.data.nodeType === "start");
  if (starts.length === 0) {
    nodes.unshift({
      id: "node-start",
      type: "start",
      position: { x: 300, y: 40 },
      data: { label: "Start", nodeType: "start" },
    });
    ids.add("node-start");
  } else if (starts.length > 1) {
    for (const extra of starts.slice(1)) {
      extra.type = "message";
      extra.data.nodeType = "message";
      if (!extra.data.messageText) extra.data.messageText = extra.data.label || "…";
    }
  }

  const edges = raw.edges
    .filter((edge: any) => edge && ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target)
    .map((edge: any, index: number) => ({
      id: typeof edge.id === "string" && edge.id.trim() ? edge.id : `e-${index + 1}`,
      source: edge.source,
      target: edge.target,
      ...(typeof edge.sourceHandle === "string" ? { sourceHandle: edge.sourceHandle } : {}),
    }));

  // A start node connected to nothing produces a bot that never speaks.
  const startId = nodes.find((node: any) => node.data.nodeType === "start")!.id;
  if (!edges.some((edge: any) => edge.source === startId)) {
    const firstOther = nodes.find((node: any) => node.id !== startId);
    if (!firstOther) return null;
    edges.unshift({ id: "e-start", source: startId, target: firstOther.id });
  }

  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.slice(0, 120) : "AI Generated Flow",
    description: typeof raw.description === "string" ? raw.description.slice(0, 300) : "",
    nodes: nodes as any,
    edges: edges as any,
  };
}

/** Models often wrap JSON in prose or fences despite instructions. */
export function extractJsonObject(text: string): any | null {
  if (!text) return null;
  const withoutFences = text.replace(/```(?:json)?/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Builds the per-request instruction.
 *
 * The wording matters more than it looks: the earlier version said "products,
 * services or intents", which nudged the model toward a shop-style ordering
 * flow even for businesses that sell nothing. It now asks for the reasons a
 * visitor would get in touch, and explicitly forbids retail language unless
 * the business actually sells items.
 */
export function buildFlowUserPrompt(prompt: string, businessName: string): string {
  return `Business name: ${businessName}

What this business does, in the owner's own words:
"""
${prompt.slice(0, 4000)}
"""

Design the chatbot flow:
- Greet the visitor and introduce the business by its real name.
- Offer a menu of the genuine reasons someone would contact THIS business.
  Derive them from the description. For a tuition centre that means things like
  course details, batch timings, fees and a demo class -- not products.
- Give each menu option its own branch, connected with sourceHandle.
- Ask only for details this business would actually need. Do not ask what
  someone wants to "order" unless the description is about selling goods.
- Include a path to a human.
- Confirm and close at the end of every branch.

Write the copy in the same language and tone as the description above.
Return only the JSON object.`;
}
