"use client";

import React, { use } from "react";
import CampaignChatPage from "@/app/c/[tenantSlug]/page";

export default function EmbedFlowPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; flowId: string }>;
}) {
  const resolvedParams = use(params);

  return <CampaignChatPage params={Promise.resolve({ tenantSlug: resolvedParams.tenantSlug })} />;
}
