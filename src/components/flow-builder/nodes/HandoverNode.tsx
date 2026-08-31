import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Headset, BellRing } from "lucide-react";
import { FlowNodeData } from "@/types";

export function HandoverNode({ data, selected }: NodeProps & { data: FlowNodeData }) {
  return (
    <div
      className={`w-72 rounded-xl bg-white border-2 shadow-md p-3.5 transition-all ${
        selected ? "border-orange-500 ring-4 ring-orange-500/10 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-orange-500 border-2 border-white"
      />

      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
          <Headset className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Live Agent Handover</span>
          <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{data.label || "Operator Handover"}</h4>
        </div>
      </div>

      <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 flex items-center gap-2 text-xs text-orange-950">
        <BellRing className="w-4 h-4 text-orange-600 shrink-0" />
        <span className="text-[11px] leading-tight">
          Pauses bot execution and alerts human agents in live inbox.
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-orange-500 border-2 border-white"
      />
    </div>
  );
}
