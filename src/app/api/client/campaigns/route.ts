import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { CampaignRepository } from "@/lib/repositories/campaignRepository";
import { requireTenantRole } from "@/lib/services/auth/session";
import { validateRequest, createCampaignSchema } from "@/lib/validation";

export async function GET(_req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);

    const campaigns = await CampaignRepository.findByTenant(tenantId);

    return NextResponse.json({ success: true, data: { campaigns }, campaigns });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const body = await req.json();
    
    const validation = await validateRequest(createCampaignSchema, body);
    if (!validation.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: validation.error } }, { status: 400 });
    
    const { name, slug, flowId, metadata } = validation.data;

    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          tenantId,
          name,
          slug,
          flowId,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "CAMPAIGN_CREATED",
          details: JSON.stringify({ campaignId: created.id, name }),
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: { campaign }, campaign }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to create campaign" } }, { status: 400 });
  }
}
