import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { createShortLinks } from "@/lib/services/shortlink";
import { getAppUrl } from "@/lib/appUrl";
import Papa from "papaparse";

export const dynamic = "force-dynamic";

/**
 * Exports a campaign's contacts with their personalised chat links.
 *
 * `?short=1` also mints a short link per contact in one pass. SMS is billed in
 * 160-character segments, and a full tracking URL can consume most of one, so
 * a bulk shortener is the difference between one segment and two across an
 * entire send.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { tenantId } = await requireTenantAccess();
    const { searchParams } = new URL(req.url);
    const wantShortLinks = ["1", "true", "yes"].includes((searchParams.get("short") || "").toLowerCase());

    const campaign = await prisma.campaign.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        tenant: { select: { slug: true, customDomain: true, customDomainVerifiedAt: true } },
        contacts: { where: { deletedAt: null } },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Campaign not found." } },
        { status: 404 },
      );
    }

    // A verified custom domain shortens the link further and keeps the
    // white-labelling intact; otherwise fall back to the platform origin.
    const platformOrigin =
      getAppUrl() ||
      `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("host") || "localhost:3000"}`;
    const chatOrigin =
      campaign.tenant.customDomain && campaign.tenant.customDomainVerifiedAt
        ? `https://${campaign.tenant.customDomain}`
        : platformOrigin;

    const rows = campaign.contacts.map((contact) => ({
      contact,
      fullUrl:
        campaign.tenant.customDomain && campaign.tenant.customDomainVerifiedAt
          ? `${chatOrigin}/?campaign=${encodeURIComponent(campaign.slug)}&contact=${encodeURIComponent(contact.customUrlSlug)}`
          : `${chatOrigin}/c/${campaign.tenant.slug}?campaign=${encodeURIComponent(campaign.slug)}&contact=${encodeURIComponent(contact.customUrlSlug)}`,
    }));

    let shortByContact = new Map<string, string>();
    if (wantShortLinks && rows.length) {
      const created = await createShortLinks(
        tenantId,
        chatOrigin,
        rows.map((row) => ({
          targetUrl: row.fullUrl,
          campaignId: campaign.id,
          campaignContactId: row.contact.id,
        })),
      );
      shortByContact = new Map(created.map((link, index) => [rows[index].contact.id, link.shortUrl]));
    }

    const csvData = rows.map(({ contact, fullUrl }) => {
      const record: Record<string, string | number> = {
        Name: contact.name || "",
        Email: contact.email || "",
        Phone: contact.phone || "",
        "Contact Identifier": contact.contactIdentifier || "",
        "Custom URL Slug": contact.customUrlSlug || "",
        "Unique Chat Link": fullUrl,
      };
      if (wantShortLinks) {
        const shortUrl = shortByContact.get(contact.id) || "";
        record["Short Link"] = shortUrl;
        // Pre-counted so the operator can see at a glance whether a message
        // will fit in one 160-character SMS segment.
        record["Short Link Length"] = shortUrl.length;
      }
      record["Status"] = contact.status || "";
      record["Opens Count"] = contact.opensCount || 0;
      record["First Opened"] = contact.firstOpenedAt ? contact.firstOpenedAt.toISOString() : "";
      record["Last Opened"] = contact.lastOpenedAt ? contact.lastOpenedAt.toISOString() : "";
      return record;
    });

    const csv = Papa.unparse(csvData);
    const filename = `campaign-${campaign.slug}-contacts${wantShortLinks ? "-short" : ""}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[campaign-export] failed:", error);
    return NextResponse.json(
      { success: false, error: { code: "EXPORT_FAILED", message: "Failed to export contacts." } },
      { status: 500 },
    );
  }
}
