import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { generateQRCodeDataUrl, generateQRCodeSVG } from "@/lib/services/qrcode";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { id: campaignId } = await params;
    const { searchParams } = new URL(req.url);
    const contactSlug = searchParams.get("contactSlug");
    const format = searchParams.get("format") || "dataurl"; // dataurl, png, svg

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      include: { tenant: { select: { slug: true } } },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";

    let targetUrl = `${protocol}://${host}/c/${campaign.tenant.slug}?campaign=${campaign.slug}`;
    if (contactSlug) {
      targetUrl = `${protocol}://${host}/c/${campaign.tenant.slug}?campaign=${campaign.slug}&contact=${contactSlug}`;
    }

    if (format === "svg") {
      const svg = await generateQRCodeSVG(targetUrl);
      return new NextResponse(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Content-Disposition": `attachment; filename="qr_${campaign.slug}.svg"`,
        },
      });
    }

    const dataUrl = await generateQRCodeDataUrl(targetUrl);
    return NextResponse.json({
      success: true,
      dataUrl,
      targetUrl,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to generate QR code" }, { status: 500 });
  }
}
