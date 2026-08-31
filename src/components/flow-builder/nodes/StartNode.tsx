import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { PlayCircle } from "lucide-react";
import { FlowNodeData } from "@/types";

export function StartNode({ data, selected }: NodeProps & { data: FlowNodeData }) {
  return (
    <div
      className={`w-64 rounded-xl bg-white border-2 shadow-md p-3.5 transition-all ${
        selected ? "border-emerald-500 ring-4 ring-emerald-500/10 shadow-lg" : "border-emerald-300"
      }`}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <PlayCircle className="w-4 h-4" />
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Start Trigger</span>
          <h4 className="text-xs font-bold text-slate-800 leading-tight">{data.label || "Conversation Start"}</h4>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-md border border-slate-100">
        Triggered when visitor opens widget or visits campaign URL.
      </p>

      {/* Single outgoing handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="start-out"
        className="w-3.5 h-3.5 bg-emerald-500 border-2 border-white"
      />
    </div>
  );
}
