import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { ListFilter, Split } from "lucide-react";
import { FlowNodeData } from "@/types";

export function ButtonsNode({ data, selected }: NodeProps & { data: FlowNodeData }) {
  const options = data.options || [];

  return (
    <div
      className={`w-72 rounded-xl bg-white border-2 shadow-md p-3.5 transition-all ${
        selected ? "border-sky-500 ring-4 ring-sky-500/10 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-sky-500 border-2 border-white"
      />

      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
          <ListFilter className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600">Quick-Reply Options</span>
          <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{data.label || "Buttons Branch"}</h4>
        </div>
      </div>

      {data.messageText && (
        <p className="text-xs text-slate-600 mb-2.5 px-0.5 line-clamp-2">{data.messageText}</p>
      )}

      <div className="space-y-1.5 mt-2">
        {options.length === 0 ? (
          <div className="text-[11px] text-slate-400 italic p-2 bg-slate-50 rounded border border-dashed border-slate-200 text-center">
            No button options added
          </div>
        ) : (
          options.map((opt, idx) => (
            <div
              key={opt.id || idx}
              className="relative flex items-center justify-between p-2 rounded-lg bg-sky-50/70 border border-sky-200 text-xs font-semibold text-sky-900"
            >
              <span className="truncate pr-4">{opt.label || `Option ${idx + 1}`}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={opt.id || `opt-${idx}`}
                className="w-3 h-3 bg-sky-500 border-2 border-white !-right-2"
              />
            </div>
          ))
        )}
      </div>

      {/* Fallback bottom handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="default-out"
        className="w-3 h-3 bg-sky-400 border-2 border-white"
      />
    </div>
  );
}
