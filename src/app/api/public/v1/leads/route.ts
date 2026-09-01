import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { hashPublicSessionToken } from "@/lib/services/public/session";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`public-lead:${ip}`, 20, 60_000)) {
    return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many requests." } }, { status: 429 });
  }

  try {
    const { conversationId, sessionToken, name, email, phone, customFields } = await req.json();

    if (typeof conversationId !== "string" || typeof sessionToken !== "string") {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid session." } }, { status: 400 });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, publicSessionTokenHash: hashPublicSessionToken(sessionToken) },
      include: { campaignContact: true },
    });

    if (!conversation) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Session not found." } }, { status: 404 });
    }

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : null;
    const cleanPhone = typeof phone === "string" ? phone.trim() : null;
    const cleanName = typeof name === "string" ? name.trim() : null;

    if (!normalizedEmail && !cleanPhone && !cleanName) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Contact information is required." } }, { status: 400 });
    }

    // Lead capture transaction: find or update contact, create lead, link conversation
    const result = await prisma.$transaction(async (tx) => {
      let contact = null;
      if (normalizedEmail) {
        contact = await tx.contact.findFirst({
          where: { tenantId: conversation.tenantId, email: normalizedEmail, deletedAt: null },
        });
      }
      if (!contact && cleanPhone) {
        contact = await tx.contact.findFirst({
          where: { tenantId: conversation.tenantId, phone: cleanPhone, deletedAt: null },
        });
      }

      if (contact) {
        contact = await tx.contact.update({
          where: { id: contact.id },
          data: {
            name: cleanName || contact.name,
            phone: cleanPhone || contact.phone,
          },
        });
      } else {
        contact = await tx.contact.create({
          data: {
            tenantId: conversation.tenantId,
            name: cleanName,
            email: normalizedEmail,
            phone: cleanPhone,
            source: "chatbot_widget",
          },
        });
      }

      const lead = await tx.lead.create({
        data: {
          tenantId: conversation.tenantId,
          conversationId: conversation.id,
          name: cleanName,
          email: normalizedEmail,
          phone: cleanPhone,
          contactInfo: JSON.stringify({ name: cleanName, email: normalizedEmail, phone: cleanPhone }),
          collectedFields: JSON.stringify(customFields || {}),
          status: "NEW",
          score: 10,
        },
      });

      await tx.analyticsEvent.create({
        data: {
          tenantId: conversation.tenantId,
          flowId: conversation.flowId,
          conversationId: conversation.id,
          eventType: "CONVERSION",
          metadata: JSON.stringify({ leadId: lead.id, contactId: contact.id }),
        },
      });

      return { lead, contact };
    });

    return NextResponse.json({ success: true, data: { leadId: result.lead.id } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to submit lead" } }, { status: 400 });
  }
}
