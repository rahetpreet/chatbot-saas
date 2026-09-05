import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isSlugAllowedOnHost } from "@/lib/services/tenant/hostGuard";

/**
 * Iframe wrapper for embedding a flow on a customer's website.
 *
 * Guarded like the chat page itself: a connected domain may only frame its own
 * workspace, so a customer's hostname cannot be used to present another
 * company's bot.
 */
export default async function EmbedFlowPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; flowId: string }>;
}) {
  const { tenantSlug, flowId } = await params;
  const host = (await headers()).get("host");

  if (!(await isSlugAllowedOnHost(host, tenantSlug))) notFound();

  const source = `/c/${encodeURIComponent(tenantSlug)}?flowId=${encodeURIComponent(flowId)}`;
  return <iframe title="Chatbot" src={source} className="h-screen w-full border-0" />;
}
