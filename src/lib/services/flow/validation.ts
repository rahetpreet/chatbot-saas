import { FlowNodeData } from "@/types";

type FlowNode = { id?: unknown; type?: unknown; data?: FlowNodeData };
type FlowEdge = { source?: unknown; target?: unknown };

export function validateFlowGraph(nodesValue: unknown, edgesValue: unknown): string[] {
  if (!Array.isArray(nodesValue) || !Array.isArray(edgesValue)) return ["Flow nodes and edges must be arrays."];
  const nodes = nodesValue as FlowNode[];
  const edges = edgesValue as FlowEdge[];
  if (nodes.length === 0) return ["A flow must contain at least one START node."];

  const ids = new Set<string>();
  const errors: string[] = [];
  let startCount = 0;
  for (const node of nodes) {
    if (typeof node.id !== "string" || !node.id) { errors.push("Every node requires an ID."); continue; }
    if (ids.has(node.id)) errors.push(`Duplicate node ID: ${node.id}.`);
    ids.add(node.id);
    const type = node.data?.nodeType || node.type;
    if (type === "start") startCount++;
    if (type === "input" && (!node.data?.inputKey || typeof node.data.inputKey !== "string")) errors.push(`Input node ${node.id} requires an input key.`);
    if (type === "webhook" && node.data?.webhookUrl) {
      try { const url = new URL(node.data.webhookUrl); if (!/^https?:$/.test(url.protocol)) errors.push(`Webhook node ${node.id} needs an HTTP(S) URL.`); } catch { errors.push(`Webhook node ${node.id} has an invalid URL.`); }
    }
    if (type === "buttons") {
      const options = node.data?.options;
      if (!Array.isArray(options) || options.length === 0) errors.push(`Button node ${node.id} needs at least one option.`);
    }
  }
  if (startCount !== 1) errors.push("A flow must contain exactly one START node.");
  for (const edge of edges) {
    if (typeof edge.source !== "string" || !ids.has(edge.source) || typeof edge.target !== "string" || !ids.has(edge.target)) errors.push("Every edge must reference existing source and target nodes.");
  }
  return errors;
}
