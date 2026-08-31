import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitFork, Check, X } from "lucide-react";
import { FlowNodeData } from "@/types";

export function ConditionNode({ data, selected }: NodeProps & { data: FlowNodeData }) {
  const conditions = data.conditions || [];

  return (
    <div
      className={`w-72 rounded-xl bg-white border-2 shadow-md p-3.5 transition-all ${
        selected ? "border-amber-500 ring-4 ring-amber-500/10 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-amber-500 border-2 border-white"
      />

      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
          <GitFork className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">IF / ELSE Branch</span>
          <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{data.label || "Logic Filter"}</h4>
        </div>
      </div>

      <div className="space-y-1.5 mt-2">
        {conditions.map((cond, idx) => (
          <div
            key={cond.id || idx}
            className="relative flex items-center justify-between p-2 rounded-lg bg-amber-50/70 border border-amber-200 text-[11px] text-amber-900 font-medium"
          >
            <div className="flex items-center gap-1 truncate pr-3">
              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="font-mono font-bold">${"{" + cond.variable + "}"}</span>
              <span>{cond.operator}</span>
              <span className="font-bold truncate">&ldquo;{cond.value}&rdquo;</span>
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id={cond.id || `cond-${idx}`}
              className="w-3 h-3 bg-emerald-500 border-2 border-white !-right-2"
            />
          </div>
        ))}

        <div className="relative flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 font-medium">
          <div className="flex items-center gap-1">
            <X className="w-3 h-3 text-slate-400 shrink-0" />
            <span>Otherwise (Else fallback)</span>
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="fallback"
            className="w-3 h-3 bg-slate-400 border-2 border-white !-right-2"
          />
        </div>
      </div>
    </div>
  );
}
