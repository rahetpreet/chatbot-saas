import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Sparkles, BookOpen } from "lucide-react";
import { FlowNodeData } from "@/types";

export function AIFallbackNode({ data, selected }: NodeProps & { data: FlowNodeData }) {
  return (
    <div
      className={`w-72 rounded-xl bg-white border-2 shadow-md p-3.5 transition-all ${
        selected ? "border-violet-500 ring-4 ring-violet-500/10 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-violet-500 border-2 border-white"
      />

      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600">AI Fallback & KB</span>
          <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{data.label || "AI Knowledge Base"}</h4>
        </div>
      </div>

      <div className="bg-violet-50/50 border border-violet-100 rounded-lg p-2.5 space-y-1 text-xs">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-violet-900">
          <BookOpen className="w-3 h-3" />
          <span>Local FAQs / Ollama / LLM</span>
        </div>
        <p className="text-[11px] text-slate-600 line-clamp-2">
          {data.aiPrompt || "Answers user questions using company knowledge base with automated fallback."}
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-violet-500 border-2 border-white"
      />
    </div>
  );
}
