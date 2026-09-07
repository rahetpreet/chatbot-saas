import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole, getSession } from "@/lib/services/auth/session";

export const dynamic = "force-dynamic";

/**
 * Registers this browser to receive push notifications.
 *
 * The subscription belongs to both the workspace and the person, so a device
 * only ever receives its own company's leads, and removing one colleague does
 * not silence the rest of the team.
 */
export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const session = await getSession();
    if (!session?.userId) throw new Error("Not authenticated");

    const body = await req.json().catch(() => ({}));
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Incomplete subscription." } },
        { status: 400 },
      );
    }

    // The endpoint is unique per device+browser, so re-subscribing the same
    // device updates it rather than accumulating duplicates that would each
    // deliver the same notification.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        tenantId,
        userId: session.userId,
        endpoint,
        p256dh,
        auth,
        userAgent: req.headers.get("user-agent")?.slice(0, 256) ?? null,
      },
      update: {
        tenantId,
        userId: session.userId,
        p256dh,
        auth,
        lastUsedAt: new Date(),
        // A device that re-subscribes is alive again.
        failedAt: null,
      },
    });

    // Turning on the channel is the obvious intent of allowing notifications;
    // making them then hunt for a second switch would be needless.
    await prisma.notificationSetting.upsert({
      where: { tenantId },
      create: { tenantId, webPushEnabled: true },
      update: { webPushEnabled: true },
    });

    const devices = await prisma.pushSubscription.count({ where: { tenantId, failedAt: null } });
    return NextResponse.json({ success: true, data: { devices, message: "This device will now be notified." } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: error?.message || "Could not subscribe." } },
      { status: 400 },
    );
  }
}

/** Stops notifications to this browser. */
export async function DELETE(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const endpoint = new URL(req.url).searchParams.get("endpoint") || "";

    if (endpoint) {
      // Scoped to the workspace: an endpoint string alone must not let anyone
      // unsubscribe a device belonging to another company.
      await prisma.pushSubscription.deleteMany({ where: { endpoint, tenantId } });
    }

    const devices = await prisma.pushSubscription.count({ where: { tenantId, failedAt: null } });
    return NextResponse.json({ success: true, data: { devices, message: "This device will no longer be notified." } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: error?.message || "Could not unsubscribe." } },
      { status: 400 },
    );
  }
}
