import crypto from "crypto";
import prisma from "@/lib/prisma";

/**
 * Tracking links.
 *
 * A TrackingLink is the durable record of one shareable URL: who it was sent
 * to, which campaign it belongs to, how many times it was opened, how many
 * conversations it produced and whether it ever converted. The token is
 * cryptographically random and never derived from an email address, phone
 * number or row id, so possessing a link reveals nothing about the recipient
 * and links cannot be enumerated.
 */

// Excludes 0/O/1/l/I so a token survives being read aloud or retyped.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TOKEN_LENGTH = 10;

export function generateTrackingToken(length = TOKEN_LENGTH): string {
  const bytes = crypto.randomBytes(length * 2);
  let out = "";
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    // Rejection sampling; a plain modulo would bias the early characters.
    const value = bytes[i];
    if (value >= 256 - (256 % ALPHABET.length)) continue;
    out += ALPHABET[value % ALPHABET.length];
  }
  return out.length === length ? out : generateTrackingToken(length);
}

export interface TrackingLinkSeed {
  tenantId: string;
  campaignId?: string | null;
  campaignContactId?: string | null;
  contactId?: string | null;
  flowId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
}

/** Creates tracking links in bulk, returning them in the order supplied. */
export async function createTrackingLinks(seeds: TrackingLinkSeed[]): Promise<Array<{ id: string; token: string }>> {
  if (seeds.length === 0) return [];

  const used = new Set<string>();
  const rows = seeds.map((seed) => {
    let token = generateTrackingToken();
    while (used.has(token)) token = generateTrackingToken();
    used.add(token);
    return {
      tenantId: seed.tenantId,
      campaignId: seed.campaignId ?? null,
      campaignContactId: seed.campaignContactId ?? null,
      contactId: seed.contactId ?? null,
      flowId: seed.flowId ?? null,
      utmSource: seed.utmSource ?? null,
      utmMedium: seed.utmMedium ?? null,
      utmCampaign: seed.utmCampaign ?? null,
      utmContent: seed.utmContent ?? null,
      utmTerm: seed.utmTerm ?? null,
      token,
    };
  });

  await prisma.trackingLink.createMany({ data: rows, skipDuplicates: true });

  const created = await prisma.trackingLink.findMany({
    where: { token: { in: rows.map((row) => row.token) } },
    select: { id: true, token: true },
  });
  const byToken = new Map(created.map((row) => [row.token, row]));
  return rows.map((row) => byToken.get(row.token)!).filter(Boolean);
}

export interface ResolvedTrackingLink {
  id: string;
  tenantSlug: string;
  customDomain: string | null;
  customDomainVerified: boolean;
  campaignSlug: string | null;
  contactSlug: string | null;
  flowId: string | null;
  token: string;
  utm: Record<string, string>;
}

/**
 * Resolves a token and records the open.
 *
 * The open is counted before the redirect because a click that is not counted
 * is indistinguishable from one that never happened; the write is small and
 * indexed. An inactive link, a deleted campaign or a suspended workspace all
 * resolve to null so the visitor is sent to a neutral page rather than an
 * error.
 */
export async function resolveTrackingLink(token: string): Promise<ResolvedTrackingLink | null> {
  const link = await prisma.trackingLink.findFirst({
    where: { token, isActive: true, deletedAt: null },
    select: {
      id: true,
      token: true,
      flowId: true,
      campaignContactId: true,
      firstOpenedAt: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmContent: true,
      utmTerm: true,
      tenant: {
        select: { slug: true, status: true, deletedAt: true, customDomain: true, customDomainVerifiedAt: true },
      },
      campaign: { select: { slug: true, deletedAt: true } },
    },
  });

  if (!link || !link.tenant || link.tenant.deletedAt) return null;
  if (!["TRIAL", "ACTIVE"].includes(link.tenant.status)) return null;

  // campaignContactId is a plain column rather than a relation, so this is a
  // separate lookup; it only runs for links that target a specific recipient.
  const campaignContact = link.campaignContactId
    ? await prisma.campaignContact
        .findUnique({ where: { id: link.campaignContactId }, select: { customUrlSlug: true } })
        .catch(() => null)
    : null;

  const now = new Date();
  await prisma.$transaction([
    prisma.trackingLink.update({
      where: { id: link.id },
      data: {
        openCount: { increment: 1 },
        lastOpenedAt: now,
        // Only set on the very first open, so "first seen" stays meaningful.
        ...(link.firstOpenedAt ? {} : { firstOpenedAt: now }),
      },
    }),
    ...(link.campaign && !link.campaign.deletedAt
      ? [
          prisma.campaign.updateMany({
            where: { slug: link.campaign.slug },
            data: { opensCount: { increment: 1 } },
          }),
        ]
      : []),
  ]);

  const utm: Record<string, string> = {};
  if (link.utmSource) utm.utm_source = link.utmSource;
  if (link.utmMedium) utm.utm_medium = link.utmMedium;
  if (link.utmCampaign) utm.utm_campaign = link.utmCampaign;
  if (link.utmContent) utm.utm_content = link.utmContent;
  if (link.utmTerm) utm.utm_term = link.utmTerm;

  return {
    id: link.id,
    token: link.token,
    tenantSlug: link.tenant.slug,
    customDomain: link.tenant.customDomain,
    customDomainVerified: Boolean(link.tenant.customDomainVerifiedAt),
    campaignSlug: link.campaign && !link.campaign.deletedAt ? link.campaign.slug : null,
    contactSlug: campaignContact?.customUrlSlug ?? null,
    flowId: link.flowId,
    utm,
  };
}

/** Builds the chat URL a resolved link should redirect to. */
export function trackingRedirectUrl(link: ResolvedTrackingLink, platformOrigin: string): string {
  // Always /c/<slug>, on whichever origin. The root of a connected domain is
  // that workspace's sign-in page, so a chat link cannot point there.
  const origin =
    link.customDomain && link.customDomainVerified
      ? `https://${link.customDomain}`
      : platformOrigin.replace(/\/+$/, "");
  const base = `${origin}/c/${link.tenantSlug}`;

  const url = new URL(base);
  if (link.campaignSlug) url.searchParams.set("campaign", link.campaignSlug);
  if (link.contactSlug) url.searchParams.set("contact", link.contactSlug);
  if (link.flowId) url.searchParams.set("flowId", link.flowId);
  // Carried through so the conversation can be attributed back to this exact
  // link, not merely to the campaign.
  url.searchParams.set("t", link.token);
  for (const [key, value] of Object.entries(link.utm)) url.searchParams.set(key, value);

  return url.toString();
}

/** Called when a conversation starts from a tracking link. */
export async function recordTrackingConversation(token: string, tenantId: string): Promise<string | null> {
  const link = await prisma.trackingLink.findFirst({
    where: { token, tenantId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!link) return null;

  await prisma.trackingLink
    .update({ where: { id: link.id }, data: { conversationCount: { increment: 1 } } })
    .catch((error) => console.warn("[tracking] could not count conversation:", error));

  return link.id;
}

/** Called when a lead is captured, so conversion is visible per link. */
export async function markTrackingLinkConverted(trackingLinkId: string | null | undefined): Promise<void> {
  if (!trackingLinkId) return;
  await prisma.trackingLink
    .update({ where: { id: trackingLinkId }, data: { leadGenerated: true } })
    .catch((error) => console.warn("[tracking] could not mark conversion:", error));
}
