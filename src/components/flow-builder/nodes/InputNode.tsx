import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FormInput, AtSign, Phone, Hash, Calendar, Type } from "lucide-react";
import { FlowNodeData } from "@/types";

export function InputNode({ data, selected }: NodeProps & { data: FlowNodeData }) {
  const typeIcons: Record<string, any> = {
    email: AtSign,
    phone: Phone,
    number: Hash,
    date: Calendar,
    text: Type,
    name: Type,
  };

  const IconComponent = typeIcons[data.inputType || "text"] || FormInput;

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
          <IconComponent className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
              Input Form ({data.inputType || "text"})
            </span>
            {data.required && (
              <span className="text-[9px] bg-rose-100 text-rose-700 font-bold px-1.5 py-0.2 rounded">
                Required
              </span>
            )}
          </div>
          <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{data.label || "Collect Data"}</h4>
        </div>
      </div>

      {data.messageText && (
        <p className="text-xs text-slate-600 mb-2 px-0.5">{data.messageText}</p>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-between text-xs text-slate-500">
        <span className="truncate italic">{data.inputPlaceholder || "Visitor typing response..."}</span>
        <span className="text-[10px] font-mono bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
          ${"{" + (data.inputKey || "answer") + "}"}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-amber-500 border-2 border-white"
      />
    </div>
  );
}
