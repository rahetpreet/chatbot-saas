import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Paperclip, UploadCloud } from "lucide-react";
import { FlowNodeData } from "@/types";

export function AttachmentNode({ data, selected }: NodeProps & { data: FlowNodeData }) {
  return (
    <div
      className={`w-72 rounded-xl bg-white border-2 shadow-md p-3.5 transition-all ${
        selected ? "border-purple-500 ring-4 ring-purple-500/10 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-purple-500 border-2 border-white"
      />

      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
          <Paperclip className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">File Upload</span>
          <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{data.label || "File Upload"}</h4>
        </div>
      </div>

      <div className="border border-dashed border-purple-200 bg-purple-50/50 rounded-lg p-2.5 text-center">
        <UploadCloud className="w-5 h-5 text-purple-500 mx-auto mb-1" />
        <p className="text-[11px] text-purple-900 font-medium">
          {data.uploadPrompt || "Upload document, screenshot, or receipt"}
        </p>
        <p className="text-[10px] text-purple-600 mt-0.5">Max size: {data.maxSizeMb || 10}MB</p>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-purple-500 border-2 border-white"
      />
    </div>
  );
}
