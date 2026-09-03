import crypto from "crypto";
import prisma from "@/lib/prisma";

/**
 * Short links for campaign URLs.
 *
 * An SMS is billed per 160-character GSM-7 segment, and a full tracking URL
 * (https://chat.example.com/c/acme?campaign=spring&contact=aB3x9Lm2) can eat
 * most of a segment by itself. These codes are served from the platform's own
 * domain, so shortening costs nothing and no third-party service sees the
 * recipient list.
 */

// Deliberately excludes 0/O/1/l/I so a code stays unambiguous when someone
// reads it off a screen or retypes it from a printed message.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 7;

function randomCode(length = CODE_LENGTH): string {
  const bytes = crypto.randomBytes(length * 2);
  let out = "";
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    // Rejection sampling keeps the distribution uniform; a plain modulo would
    // bias the first few characters of the alphabet.
    const value = bytes[i];
    if (value >= 256 - (256 % ALPHABET.length)) continue;
    out += ALPHABET[value % ALPHABET.length];
  }
  return out.length === length ? out : randomCode(length);
}

export interface ShortLinkInput {
  targetUrl: string;
  campaignId?: string | null;
  campaignContactId?: string | null;
}

export interface CreatedShortLink {
  code: string;
  shortUrl: string;
  targetUrl: string;
  campaignContactId?: string | null;
}

/**
 * Creates short links in bulk, reusing any that already exist for the same
 * target so that regenerating a campaign export does not churn through codes
 * that have already been sent to recipients.
 */
export async function createShortLinks(
  tenantId: string,
  baseUrl: string,
  inputs: ShortLinkInput[],
): Promise<CreatedShortLink[]> {
  if (inputs.length === 0) return [];

  const targets = [...new Set(inputs.map((input) => input.targetUrl))];
  const existing = await prisma.shortLink.findMany({
    where: { tenantId, targetUrl: { in: targets }, isActive: true },
    select: { code: true, targetUrl: true, campaignContactId: true },
  });
  const byTarget = new Map(existing.map((link) => [link.targetUrl, link]));

  const toCreate: Array<{
    tenantId: string;
    code: string;
    targetUrl: string;
    campaignId: string | null;
    campaignContactId: string | null;
  }> = [];
  const usedCodes = new Set<string>();

  for (const input of inputs) {
    if (byTarget.has(input.targetUrl)) continue;
    let code = randomCode();
    while (usedCodes.has(code)) code = randomCode();
    usedCodes.add(code);

    const row = {
      tenantId,
      code,
      targetUrl: input.targetUrl,
      campaignId: input.campaignId ?? null,
      campaignContactId: input.campaignContactId ?? null,
    };
    toCreate.push(row);
    byTarget.set(input.targetUrl, { code, targetUrl: input.targetUrl, campaignContactId: row.campaignContactId });
  }

  if (toCreate.length) {
    // skipDuplicates absorbs the vanishingly rare code collision; the affected
    // target simply resolves to the pre-existing row on the next lookup.
    await prisma.shortLink.createMany({ data: toCreate, skipDuplicates: true });
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return inputs.map((input) => {
    const link = byTarget.get(input.targetUrl)!;
    return {
      code: link.code,
      shortUrl: `${normalizedBase}/s/${link.code}`,
      targetUrl: input.targetUrl,
      campaignContactId: input.campaignContactId ?? null,
    };
  });
}

/** Resolves a code and records the click. Returns null when unusable. */
export async function resolveShortLink(code: string): Promise<{ targetUrl: string } | null> {
  const link = await prisma.shortLink.findFirst({
    where: { code, isActive: true },
    select: { id: true, targetUrl: true },
  });
  if (!link) return null;

  // Click counting must never block or fail the redirect.
  prisma.shortLink
    .update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 }, lastClickAt: new Date() },
    })
    .catch((error) => console.warn("[shortlink] could not record click:", error));

  return { targetUrl: link.targetUrl };
}
