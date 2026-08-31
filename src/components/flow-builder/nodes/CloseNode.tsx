import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { CheckCircle2, Flag } from "lucide-react";
import { FlowNodeData } from "@/types";

export function CloseNode({ data, selected }: NodeProps & { data: FlowNodeData }) {
  return (
    <div
      className={`w-72 rounded-xl bg-white border-2 shadow-md p-3.5 transition-all ${
        selected ? "border-emerald-600 ring-4 ring-emerald-500/10 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-emerald-600 border-2 border-white"
      />

      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Close / End Flow</span>
          <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{data.label || "End Conversation"}</h4>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 font-sans line-clamp-2">
        {data.closingMessage || "Marks conversation resolved and triggers lead notification."}
      </div>
    </div>
  );
}
