import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import { slugify, generateRandomId } from "@/lib/utils";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id: campaignId } = await params;
    const body = await req.json();

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId, deletedAt: null },
    });

    if (!campaign) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Campaign not found" } }, { status: 404 });
    }

    const contactsInput = Array.isArray(body.contacts) ? body.contacts : [];
    if (!contactsInput.length) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "At least one contact is required to generate tracking links." } }, { status: 400 });
    }

    const createdLinks = [];

    for (let i = 0; i < contactsInput.length; i++) {
      const contact = contactsInput[i];
      const name = typeof contact.name === "string" ? contact.name.trim() : null;
      const email = typeof contact.email === "string" ? contact.email.trim().toLowerCase() : null;
      const phone = typeof contact.phone === "string" ? contact.phone.trim() : null;
      const identifier = contact.identifier || `c_${Date.now()}_${i + 1}`;

      const namePart = name ? slugify(name).substring(0, 20) : "c";
      const customUrlSlug = `${namePart}-${generateRandomId(6)}`;

      const campaignContact = await prisma.campaignContact.create({
        data: {
          campaignId,
          tenantId,
          contactIdentifier: identifier,
          name,
          email,
          phone,
          customUrlSlug,
          metadata: JSON.stringify(contact.metadata || {}),
        },
      });

      createdLinks.push(campaignContact);
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: "TRACKING_LINKS_GENERATED",
        details: JSON.stringify({ campaignId, count: createdLinks.length }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        count: createdLinks.length,
        links: createdLinks,
      },
      message: `Generated ${createdLinks.length} tracking links.`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to generate tracking links." } }, { status: 500 });
  }
}
