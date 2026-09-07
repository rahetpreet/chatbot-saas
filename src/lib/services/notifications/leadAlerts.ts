import prisma from "@/lib/prisma";
import webpush from "web-push";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { sendAppEmail } from "@/lib/services/email";
import { getAppUrl } from "@/lib/appUrl";

/**
 * Tells a workspace that a lead just arrived.
 *
 * Three channels, each independently switchable per workspace: Telegram, a
 * browser push notification, and email. A client only ever receives their own
 * leads — every lookup here is keyed on the tenant that owns the lead.
 *
 * Two rules govern the whole file:
 *
 *  1. A failing channel must never fail the lead. Capture already succeeded by
 *     the time this runs; losing the alert is bad, losing the customer's
 *     details because a bot token expired is unforgivable.
 *  2. Every send is awaited. On serverless the function is frozen the moment a
 *     response is returned, so a promise left dangling is simply never
 *     delivered — the same way the short-link counter lost every click.
 */

export interface LeadAlert {
  tenantId: string;
  leadId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  campaignName?: string | null;
  chatbotName?: string | null;
  /** What the visitor said they wanted, when the flow captured it. */
  interest?: string | null;
}

export interface ChannelResult {
  channel: "telegram" | "push" | "email";
  sent: boolean;
  detail: string;
}

/** Web push needs a key pair; without one the channel simply stays off. */
function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    // Push services require a contact; mailto is the conventional form.
    subject: process.env.VAPID_SUBJECT || `mailto:${process.env.SMTP_FROM_EMAIL || "alerts@example.com"}`,
  };
}

export function isWebPushConfigured(): boolean {
  return vapid() !== null;
}

export function webPushPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

/** A one-line summary used as the notification title everywhere. */
function headline(alert: LeadAlert): string {
  const who = alert.name || alert.email || alert.phone || "Someone";
  return `New lead: ${who}`;
}

/** The detail block, with only the fields that actually have a value. */
function lines(alert: LeadAlert): string[] {
  const out: string[] = [];
  if (alert.name) out.push(alert.name);
  if (alert.phone) out.push(alert.phone);
  if (alert.email) out.push(alert.email);
  if (alert.interest) out.push(`Interested in: ${alert.interest}`);
  if (alert.campaignName) out.push(`Campaign: ${alert.campaignName}`);
  if (alert.chatbotName) out.push(`Chatbot: ${alert.chatbotName}`);
  return out;
}

function leadUrl(alert: LeadAlert): string {
  const base = (getAppUrl() || "").replace(/\/+$/, "");
  return base ? `${base}/leads` : "/leads";
}

/** Telegram's HTML mode needs these three escaped or the message is rejected. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendTelegram(token: string, chatId: string, alert: LeadAlert): Promise<ChannelResult> {
  const body = [
    `<b>${escapeHtml(headline(alert))}</b>`,
    "",
    ...lines(alert).map(escapeHtml),
    "",
    `<a href="${escapeHtml(leadUrl(alert))}">Open in your dashboard</a>`,
  ].join("\n");

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: body,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await res.json().catch(() => ({}) as any);
    if (payload?.ok) return { channel: "telegram", sent: true, detail: "delivered" };

    // Telegram's own description is far more useful than a status code: it
    // says "chat not found" or "bot was blocked", which is what the operator
    // needs to fix it.
    return { channel: "telegram", sent: false, detail: payload?.description || `HTTP ${res.status}` };
  } catch (error: any) {
    return { channel: "telegram", sent: false, detail: error?.message || "network error" };
  }
}

async function sendPush(tenantId: string, alert: LeadAlert): Promise<ChannelResult> {
  const keys = vapid();
  if (!keys) return { channel: "push", sent: false, detail: "Web push keys are not configured." };

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { tenantId, failedAt: null },
  });
  if (!subscriptions.length) return { channel: "push", sent: false, detail: "No devices subscribed." };

  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);

  const payload = JSON.stringify({
    title: headline(alert),
    body: lines(alert).slice(1).join(" · ") || "A visitor left their details.",
    url: leadUrl(alert),
    tag: `lead-${alert.leadId}`,
  });

  let delivered = 0;
  const expired: string[] = [];

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
      delivered++;
    } catch (error: any) {
      // 404 and 410 mean the browser threw the subscription away. Marking it
      // stops every future lead retrying a device that no longer exists.
      if (error?.statusCode === 404 || error?.statusCode === 410) expired.push(subscription.id);
    }
  }

  if (expired.length) {
    await prisma.pushSubscription
      .updateMany({ where: { id: { in: expired } }, data: { failedAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    channel: "push",
    sent: delivered > 0,
    detail: `${delivered}/${subscriptions.length} device(s)${expired.length ? `, ${expired.length} expired` : ""}`,
  };
}

async function sendEmail(to: string, alert: LeadAlert): Promise<ChannelResult> {
  const recipients = to
    .split(/[,;]/)
    .map((address) => address.trim())
    .filter(Boolean);
  if (!recipients.length) return { channel: "email", sent: false, detail: "No address configured." };

  const detail = lines(alert)
    .map((line) => `<p style="margin:0 0 6px">${escapeHtml(line)}</p>`)
    .join("");

  try {
    await sendAppEmail({
      to: recipients.join(","),
      subject: headline(alert),
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px">
          <h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(headline(alert))}</h2>
          ${detail}
          <p style="margin:16px 0 0">
            <a href="${escapeHtml(leadUrl(alert))}"
               style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">
              Open in your dashboard
            </a>
          </p>
        </div>`,
      text: [headline(alert), "", ...lines(alert), "", leadUrl(alert)].join("\n"),
    });
    return { channel: "email", sent: true, detail: `${recipients.length} recipient(s)` };
  } catch (error: any) {
    return { channel: "email", sent: false, detail: error?.message || "send failed" };
  }
}

/**
 * Fans a lead out to every channel the workspace has switched on.
 *
 * Channels run in sequence rather than in parallel: the connection pool holds
 * a single connection, and one of these reads from it. Sequential is the same
 * wall-clock cost here and cannot exhaust the pool.
 */
export async function notifyLeadCaptured(alert: LeadAlert): Promise<ChannelResult[]> {
  const results: ChannelResult[] = [];

  try {
    const settings = await prisma.notificationSetting.findUnique({
      where: { tenantId: alert.tenantId },
    });

    // No configuration, or the master switch is off: nothing to do, and that
    // is not a failure.
    if (!settings || !settings.leadAlerts) return results;

    if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
      const token = decryptSecret(settings.telegramBotToken);
      if (token) results.push(await sendTelegram(token, settings.telegramChatId, alert));
    }

    if (settings.webPushEnabled) {
      results.push(await sendPush(alert.tenantId, alert));
    }

    if (settings.emailEnabled && settings.emailTo) {
      results.push(await sendEmail(settings.emailTo, alert));
    }
  } catch (error) {
    // The lead is already saved. An alert that cannot be sent is logged and
    // dropped; it must never propagate into the capture request.
    console.error("[lead-alerts] dispatch failed", error);
  }

  return results;
}

/** Stores a bot token encrypted, or clears it when the field is emptied. */
export function encodeTelegramToken(token: string | null | undefined): string | null {
  if (!token || !token.trim()) return null;
  return encryptSecret(token.trim());
}

/**
 * Sends a sample alert so a client can prove the channel works before relying
 * on it. Nothing about a notification setup is worth trusting untested.
 */
export async function sendTestAlert(tenantId: string, tenantName: string): Promise<ChannelResult[]> {
  return notifyLeadCaptured({
    tenantId,
    leadId: "test",
    name: "Test Lead",
    phone: "+91 90000 00000",
    email: "test@example.com",
    interest: "Checking notifications",
    campaignName: tenantName,
  });
}
