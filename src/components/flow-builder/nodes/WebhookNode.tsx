import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Globe, ArrowRightLeft } from "lucide-react";
import { FlowNodeData } from "@/types";

export function WebhookNode({ data, selected }: NodeProps & { data: FlowNodeData }) {
  return (
    <div
      className={`w-72 rounded-xl bg-white border-2 shadow-md p-3.5 transition-all ${
        selected ? "border-teal-500 ring-4 ring-teal-500/10 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-teal-500 border-2 border-white"
      />

      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
          <Globe className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600">REST Webhook API</span>
          <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{data.label || "External Webhook"}</h4>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center gap-2 text-xs">
        <span className="font-bold text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded uppercase">
          {data.webhookMethod || "POST"}
        </span>
        <span className="truncate font-mono text-[11px] text-slate-600">
          {data.webhookUrl || "https://api.crm.com/leads"}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-teal-500 border-2 border-white"
      />
    </div>
  );
}
