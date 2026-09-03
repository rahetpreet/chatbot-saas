"use client";

import React, { useState, useEffect, use } from "react";
import { FlowCanvasWrapper } from "@/components/flow-builder/FlowCanvas";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function FlowBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [flow, setFlow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/client/chatbots/${resolvedParams.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load flow");
        return res.json();
      })
      .then((data) => setFlow(data.flow))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [resolvedParams.id]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-600">Loading flow canvas...</span>
        </div>
      </div>
    );
  }

  if (error || !flow) {
    return (
      <div className="p-8 text-center space-y-4">
        <h3 className="text-base font-bold text-rose-600">Flow not found or access denied.</h3>
        <Link href="/flows" className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-bold underline">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Flows list</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="-m-6 md:-m-8 h-[calc(100vh-4rem)] overflow-hidden">
      <FlowCanvasWrapper initialFlow={flow} />
    </div>
  );
}
