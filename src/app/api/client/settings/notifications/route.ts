import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import {
  encodeTelegramToken,
  isWebPushConfigured,
  webPushPublicKey,
  sendTestAlert,
} from "@/lib/services/notifications/leadAlerts";
import { maskSecret } from "@/lib/security/crypto";
import { decryptSecret } from "@/lib/security/crypto";

export const dynamic = "force-dynamic";

/** Where this workspace wants to be told about new leads. */
export async function GET(_req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);

    const [settings, tenant, devices] = await Promise.all([
      prisma.notificationSetting.findUnique({ where: { tenantId } }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      prisma.pushSubscription.count({ where: { tenantId, failedAt: null } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        settings: {
          leadAlerts: settings?.leadAlerts ?? true,
          telegramEnabled: settings?.telegramEnabled ?? false,
          // Never the token itself. Showing whether one is stored is enough to
          // drive the form; returning it would put a live credential in a
          // browser for no reason.
          telegramTokenSet: Boolean(settings?.telegramBotToken),
          telegramTokenHint: maskSecret(decryptSecret(settings?.telegramBotToken)),
          telegramChatId: settings?.telegramChatId ?? "",
          emailEnabled: settings?.emailEnabled ?? false,
          emailTo: settings?.emailTo ?? "",
          webPushEnabled: settings?.webPushEnabled ?? false,
        },
        webPush: {
          available: isWebPushConfigured(),
          publicKey: webPushPublicKey(),
          subscribedDevices: devices,
        },
        tenantName: tenant?.name ?? "",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: error?.message || "Unauthorized" } },
      { status: 403 },
    );
  }
}

/** Saves the configuration. */
export async function PUT(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const body = await req.json().catch(() => ({}));

    const text = (value: unknown, max = 512) =>
      typeof value === "string" ? value.trim().slice(0, max) || null : null;

    // An empty token field means "leave what is stored alone", not "delete it".
    // Otherwise re-saving the form after loading it (which never returns the
    // token) would silently wipe a working integration.
    const submittedToken = text(body.telegramBotToken, 256);
    const encodedToken = submittedToken ? encodeTelegramToken(submittedToken) : undefined;

    const data = {
      leadAlerts: body.leadAlerts !== false,
      telegramEnabled: Boolean(body.telegramEnabled),
      telegramChatId: text(body.telegramChatId, 64),
      emailEnabled: Boolean(body.emailEnabled),
      emailTo: text(body.emailTo, 512),
      webPushEnabled: Boolean(body.webPushEnabled),
      ...(encodedToken !== undefined ? { telegramBotToken: encodedToken } : {}),
    };

    await prisma.notificationSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });

    return NextResponse.json({ success: true, data: { message: "Notification settings saved." } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: error?.message || "Could not save." } },
      { status: 400 },
    );
  }
}

/**
 * Sends a sample alert on every enabled channel.
 *
 * A notification setup nobody has tested is not a notification setup: the
 * first real lead is the worst possible moment to discover a wrong chat id.
 */
export async function POST(_req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

    const results = await sendTestAlert(tenantId, tenant?.name || "Your workspace");

    if (!results.length) {
      return NextResponse.json({
        success: true,
        data: { results, message: "No channels are switched on yet." },
      });
    }

    const delivered = results.filter((r) => r.sent);
    return NextResponse.json({
      success: true,
      data: {
        results,
        message: delivered.length
          ? `Sent on ${delivered.map((r) => r.channel).join(", ")}. Check your phone.`
          : "No channel accepted the message. See the detail against each below.",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: error?.message || "Could not send." } },
      { status: 400 },
    );
  }
}
