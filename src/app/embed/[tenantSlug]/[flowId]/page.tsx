"use client";

import React, { use } from "react";

export default function EmbedFlowPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; flowId: string }>;
}) {
  const resolvedParams = use(params);

  const source = `/c/${encodeURIComponent(resolvedParams.tenantSlug)}?flowId=${encodeURIComponent(resolvedParams.flowId)}`;
  return <iframe title="Chatbot" src={source} className="h-screen w-full border-0" />;
}
