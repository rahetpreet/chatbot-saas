"use client";

import { use } from "react";
import { CampaignChatContent } from "@/components/chat/HostedChat";

/**
 * Platform-hosted chat: /c/<workspace-slug>.
 *
 * The implementation lives in a component rather than here because a workspace
 * serving its own custom domain renders the same chat from the root route, and
 * Next.js does not allow a page file to export anything but a default.
 */
export default function CampaignChatPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = use(params);
  return <CampaignChatContent tenantSlug={tenantSlug} />;
}
