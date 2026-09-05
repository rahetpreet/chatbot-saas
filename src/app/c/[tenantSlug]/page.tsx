import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CampaignChatContent } from "@/components/chat/HostedChat";
import { isSlugAllowedOnHost } from "@/lib/services/tenant/hostGuard";

/**
 * Platform-hosted chat: /c/<workspace-slug>.
 *
 * A server component so the hostname can be checked before anything renders: a
 * workspace's own domain must serve only that workspace, or any customer's
 * branded hostname could be made to host somebody else's chatbot.
 */
export default async function CampaignChatPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const host = (await headers()).get("host");

  if (!(await isSlugAllowedOnHost(host, tenantSlug))) notFound();

  return <CampaignChatContent tenantSlug={tenantSlug} />;
}
