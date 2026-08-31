import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MessageSquareText, Image, Video, FileText } from "lucide-react";
import { FlowNodeData } from "@/types";

export function MessageNode({ data, selected }: NodeProps & { data: FlowNodeData }) {
  return (
    <div
      className={`w-72 rounded-xl bg-white border-2 shadow-md p-3.5 transition-all ${
        selected ? "border-indigo-600 ring-4 ring-indigo-500/10 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-indigo-500 border-2 border-white"
      />

      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
          <MessageSquareText className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Bot Message</span>
          <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{data.label || "Message"}</h4>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs text-slate-700 font-sans line-clamp-3">
        {data.messageText || <span className="text-slate-400 italic">No text defined yet...</span>}
      </div>

      {data.mediaUrl && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-indigo-600 bg-indigo-50/70 px-2 py-1 rounded border border-indigo-100">
          {data.mediaType === "image" && <Image className="w-3 h-3" />}
          {data.mediaType === "video" && <Video className="w-3 h-3" />}
          {data.mediaType === "pdf" && <FileText className="w-3 h-3" />}
          <span className="truncate">{data.mediaType?.toUpperCase()} Attached</span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-indigo-500 border-2 border-white"
      />
    </div>
  );
}
