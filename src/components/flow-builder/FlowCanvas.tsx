"use client";

import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { StartNode } from "./nodes/StartNode";
import { MessageNode } from "./nodes/MessageNode";
import { ButtonsNode } from "./nodes/ButtonsNode";
import { InputNode } from "./nodes/InputNode";
import { AttachmentNode } from "./nodes/AttachmentNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { WebhookNode } from "./nodes/WebhookNode";
import { AIFallbackNode } from "./nodes/AIFallbackNode";
import { HandoverNode } from "./nodes/HandoverNode";
import { CloseNode } from "./nodes/CloseNode";
import { NodeConfigDrawer } from "./NodeConfigDrawer";
import { FlowSimulatorModal } from "./FlowSimulatorModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Save,
  Rocket,
  Play,
  Plus,
  Undo,
  Redo,
  Sparkles,
  MessageSquare,
  ListFilter,
  FormInput,
  Paperclip,
  GitFork,
  Globe,
  Headset,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { FlowNodeData, NodeType } from "@/types";

interface FlowCanvasProps {
  initialFlow: any;
  tenantSlug?: string;
}

export function FlowCanvas({ initialFlow, tenantSlug }: FlowCanvasProps) {
  // Parse initial nodes and edges
  const initialNodes: Node[] = useMemo(() => {
    try {
      return typeof initialFlow.nodes === "string" ? JSON.parse(initialFlow.nodes) : initialFlow.nodes || [];
    } catch {
      return [];
    }
  }, [initialFlow]);

  const initialEdges: Edge[] = useMemo(() => {
    try {
      return typeof initialFlow.edges === "string" ? JSON.parse(initialFlow.edges) : initialFlow.edges || [];
    } catch {
      return [];
    }
  }, [initialFlow]);

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowStatus, setFlowStatus] = useState<string>(initialFlow.status || "DRAFT");
  const [flowVersion, setFlowVersion] = useState<number>(initialFlow.version || 1);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  // History stack for Undo / Redo
  const [history, setHistory] = useState<Array<{ nodes: Node[]; edges: Edge[] }>>([
    { nodes: initialNodes, edges: initialEdges },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushToHistory = (newNodes: Node[], newEdges: Edge[]) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    updatedHistory.push({ nodes: newNodes, edges: newEdges });
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setNodes(prev.nodes);
      setEdges(prev.edges);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setNodes(next.nodes);
      setEdges(next.edges);
      setHistoryIndex(historyIndex + 1);
    }
  };

  const nodeTypes = useMemo(
    () => ({
      start: StartNode,
      message: MessageNode,
      buttons: ButtonsNode,
      input: InputNode,
      attachment: AttachmentNode,
      condition: ConditionNode,
      webhook: WebhookNode,
      ai_fallback: AIFallbackNode,
      handover: HandoverNode,
      close: CloseNode,
    }),
    []
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const updated = applyNodeChanges(changes, nds);
        return updated;
      });
    },
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const updated = applyEdgeChanges(changes, eds);
        return updated;
      });
    },
    []
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const updated = addEdge({ ...params, animated: true }, eds);
        pushToHistory(nodes, updated);
        return updated;
      });
    },
    [nodes, historyIndex]
  );

  const onNodeClick = (_: any, node: Node) => {
    setSelectedNodeId(node.id);
  };

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const updateNodeData = (nodeId: string, newData: Partial<FlowNodeData>) => {
    setNodes((nds) => {
      const updated = nds.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            data: { ...n.data, ...newData },
          };
        }
        return n;
      });
      pushToHistory(updated, edges);
      return updated;
    });
  };

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => {
      const updatedNodes = nds.filter((n) => n.id !== nodeId);
      const updatedEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      setEdges(updatedEdges);
      pushToHistory(updatedNodes, updatedEdges);
      return updatedNodes;
    });
    setSelectedNodeId(null);
  };

  const addNode = (type: NodeType) => {
    setIsAddMenuOpen(false);
    const id = `node-${type}-${Date.now()}`;
    const defaultLabels: Record<NodeType, string> = {
      start: "Start Trigger",
      message: "Message",
      buttons: "Quick Replies",
      input: "Input Form",
      attachment: "File Upload",
      condition: "Condition Filter",
      webhook: "Webhook API",
      ai_fallback: "AI Fallback",
      handover: "Live Handover",
      close: "End Flow",
    };

    const defaultData: FlowNodeData = {
      label: defaultLabels[type] || type,
      nodeType: type,
      messageText: type === "message" ? "Hello! How can we assist you?" : undefined,
      inputType: type === "input" ? "email" : undefined,
      inputKey: type === "input" ? "email" : undefined,
      options:
        type === "buttons"
          ? [
              { id: "opt-1", label: "Option 1", value: "opt_1" },
              { id: "opt-2", label: "Option 2", value: "opt_2" },
            ]
          : undefined,
      conditions:
        type === "condition"
          ? [{ id: "cond-1", variable: "choice", operator: "equals", value: "opt_1" }]
          : undefined,
    };

    // Position node nicely on canvas
    const x = 200 + Math.random() * 200;
    const y = 150 + Math.random() * 200;

    const newNode: Node = {
      id,
      type,
      position: { x, y },
      data: defaultData,
    };

    setNodes((nds) => {
      const updated = [...nds, newNode];
      pushToHistory(updated, edges);
      return updated;
    });
    setSelectedNodeId(id);
  };

  // Save Draft
  const handleSave = async () => {
    setSaving(true);
    setSaveSuccessMsg(null);
    try {
      const res = await fetch(`/api/flows/${initialFlow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes: JSON.stringify(nodes),
          edges: JSON.stringify(edges),
        }),
      });
      if (res.ok) {
        setSaveSuccessMsg("Draft saved successfully!");
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      }
    } catch {
      alert("Failed to save draft.");
    } finally {
      setSaving(false);
    }
  };

  // Publish Flow
  const handlePublish = async () => {
    setPublishing(true);
    try {
      // Save draft first
      await fetch(`/api/flows/${initialFlow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes: JSON.stringify(nodes),
          edges: JSON.stringify(edges),
        }),
      });

      // Publish snapshot
      const res = await fetch(`/api/flows/${initialFlow.id}/publish`, {
        method: "POST",
      });

      const data = await res.json();
      if (data.success) {
        setFlowStatus("PUBLISHED");
        setFlowVersion(data.flow.version);
        setSaveSuccessMsg(`Published Version ${data.flow.version} is now live on your widget!`);
        setTimeout(() => setSaveSuccessMsg(null), 4000);
      }
    } catch {
      alert("Failed to publish flow.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-100">
      {/* Top Builder Action Bar */}
      <div className="h-14 bg-white border-b border-slate-200 px-5 flex items-center justify-between z-10 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-slate-900 leading-none">{initialFlow.name}</h2>
          <Badge variant={flowStatus === "PUBLISHED" ? "success" : "default"}>
            {flowStatus} (v{flowVersion})
          </Badge>
          {saveSuccessMsg && (
            <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 animate-fade-in">
              {saveSuccessMsg}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Add Node Dropdown */}
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              className="gap-1.5 font-semibold text-xs"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              <span>Add Node</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </Button>

            {isAddMenuOpen && (
              <div className="absolute left-0 mt-1 w-56 rounded-xl bg-white p-1.5 shadow-xl border border-slate-200 z-50 animate-fade-in text-xs">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Select Node Type
                </div>
                <button
                  onClick={() => addNode("message")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium"
                >
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <span>Bot Message Node</span>
                </button>
                <button
                  onClick={() => addNode("buttons")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium"
                >
                  <ListFilter className="w-4 h-4 text-sky-600" />
                  <span>Buttons / Quick Reply</span>
                </button>
                <button
                  onClick={() => addNode("input")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium"
                >
                  <FormInput className="w-4 h-4 text-amber-600" />
                  <span>Input Form Field</span>
                </button>
                <button
                  onClick={() => addNode("attachment")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium"
                >
                  <Paperclip className="w-4 h-4 text-purple-600" />
                  <span>File / Attachment Upload</span>
                </button>
                <button
                  onClick={() => addNode("condition")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium"
                >
                  <GitFork className="w-4 h-4 text-amber-600" />
                  <span>Condition / IF-ELSE</span>
                </button>
                <button
                  onClick={() => addNode("webhook")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium"
                >
                  <Globe className="w-4 h-4 text-teal-600" />
                  <span>REST Webhook Call</span>
                </button>
                <button
                  onClick={() => addNode("ai_fallback")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium"
                >
                  <Sparkles className="w-4 h-4 text-violet-600" />
                  <span>AI Fallback & KB</span>
                </button>
                <button
                  onClick={() => addNode("handover")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium"
                >
                  <Headset className="w-4 h-4 text-orange-600" />
                  <span>Live Operator Handover</span>
                </button>
                <button
                  onClick={() => addNode("close")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Close / End Flow</span>
                </button>
              </div>
            )}
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center border-l border-r border-slate-200 px-2 gap-1">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              title="Undo"
            >
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              title="Redo"
            >
              <Redo className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Test Simulator */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsSimulatorOpen(true)}
            className="gap-1.5 text-xs text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 font-semibold"
          >
            <Play className="w-3.5 h-3.5 fill-indigo-600 text-indigo-600" />
            <span>Test Simulator</span>
          </Button>

          {/* Save Draft */}
          <Button size="sm" variant="outline" onClick={handleSave} loading={saving} className="gap-1.5 text-xs">
            <Save className="w-3.5 h-3.5" />
            <span>Save Draft</span>
          </Button>

          {/* Publish */}
          <Button size="sm" onClick={handlePublish} loading={publishing} className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
            <Rocket className="w-3.5 h-3.5" />
            <span>Publish Live</span>
          </Button>
        </div>
      </div>

      {/* Main Flow Canvas & Drawer Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 h-full w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2}
          >
            <Background color="#cbd5e1" gap={20} size={1} />
            <Controls className="bg-white border border-slate-200 rounded-lg shadow-sm" />
            <MiniMap
              nodeStrokeColor="#6366f1"
              nodeColor="#e0e7ff"
              className="border border-slate-200 rounded-lg shadow-sm"
            />
          </ReactFlow>
        </div>

        {/* Node Configuration Drawer */}
        {selectedNode && (
          <NodeConfigDrawer
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
            onUpdateNodeData={updateNodeData}
            onDeleteNode={deleteNode}
          />
        )}
      </div>

      {/* Flow Simulator Modal */}
      {isSimulatorOpen && (
        <FlowSimulatorModal
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
          flowId={initialFlow.id}
          nodes={nodes}
          edges={edges}
          tenantSlug={tenantSlug}
        />
      )}
    </div>
  );
}

export function FlowCanvasWrapper(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  );
}
