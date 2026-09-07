"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Loading";
import { Bell, Send, Mail, Smartphone, Check, AlertTriangle, ExternalLink } from "lucide-react";

/**
 * Per-workspace lead alerts.
 *
 * Each company configures its own destinations, so a client's leads only ever
 * reach that client. Every channel has a test button: the first real lead is
 * the worst possible moment to discover a wrong chat id.
 */

/** Converts the server's base64url VAPID key into the byte array the browser wants. */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  // Returned as a plain ArrayBuffer: the subscribe() type wants a buffer
  // backed by ArrayBuffer specifically, not the broader ArrayBufferLike a
  // Uint8Array can carry.
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0))).buffer as ArrayBuffer;
}

export function LeadNotifications() {
  const [settings, setSettings] = useState<any>(null);
  const [webPush, setWebPush] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any[] | null>(null);
  const [token, setToken] = useState("");
  const [thisDeviceOn, setThisDeviceOn] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client/settings/notifications");
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not load notification settings.");
        return;
      }
      setSettings(json.data.settings);
      setWebPush(json.data.webPush);
      setError(null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Whether *this* browser is already subscribed, which is a different question
  // from whether the workspace has the channel switched on.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistration("/push-sw.js")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setThisDeviceOn(Boolean(subscription)))
      .catch(() => undefined);
  }, []);

  const save = async (patch: Record<string, unknown> = {}) => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/client/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, ...patch, telegramBotToken: token || undefined }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not save.");
        return;
      }
      setToken("");
      setNotice("Saved.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setResults(null);
    setNotice(null);
    try {
      const res = await fetch("/api/client/settings/notifications", { method: "POST" });
      const json = await res.json();
      setResults(json.data?.results ?? null);
      setNotice(json.data?.message ?? null);
    } finally {
      setTesting(false);
    }
  };

  const enablePushHere = async () => {
    setPushBusy(true);
    setError(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setError("This browser cannot show push notifications.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        // Refusing at the browser prompt is a decision, not a failure, but it
        // is worth saying plainly since nothing else on screen would change.
        setError("Notifications are blocked for this site. Allow them in your browser settings to continue.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/push-sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(webPush.publicKey),
      });

      const res = await fetch("/api/client/settings/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not register this device.");
        return;
      }
      setThisDeviceOn(true);
      setNotice("This device will now be notified, even with the dashboard closed.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not enable notifications on this device.");
    } finally {
      setPushBusy(false);
    }
  };

  const disablePushHere = async () => {
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch(`/api/client/settings/notifications/push?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
          method: "DELETE",
        });
        await subscription.unsubscribe();
      }
      setThisDeviceOn(false);
      setNotice("This device will no longer be notified.");
      await load();
    } finally {
      setPushBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Spinner /> Loading notification settings…
        </CardContent>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-red-600">{error || "Unavailable."}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-indigo-600" />
          Lead alerts
        </CardTitle>
        <CardDescription>
          Get told the moment someone leaves their details, without keeping this dashboard open.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            {notice}
          </p>
        )}

        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
          <input
            type="checkbox"
            checked={settings.leadAlerts}
            onChange={(e) => setSettings({ ...settings, leadAlerts: e.target.checked })}
            className="rounded border-slate-300"
          />
          <span className="text-xs font-semibold text-slate-800">Alert me about new leads</span>
          <span className="text-[11px] text-slate-500">— the master switch for everything below</span>
        </label>

        {/* ---- Telegram ---- */}
        <div className="rounded-xl border border-slate-200 p-3.5">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.telegramEnabled}
              onChange={(e) => setSettings({ ...settings, telegramEnabled: e.target.checked })}
              className="rounded border-slate-300"
            />
            <Send className="h-3.5 w-3.5 text-sky-600" />
            <span className="text-xs font-bold text-slate-900">Telegram</span>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
              Instant · free
            </span>
          </label>

          {settings.telegramEnabled && (
            <div className="mt-3 space-y-2.5">
              <ol className="space-y-1 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600">
                <li>
                  1. In Telegram, message{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-indigo-600 hover:underline"
                  >
                    @BotFather <ExternalLink className="inline h-2.5 w-2.5" />
                  </a>{" "}
                  and send <code className="rounded bg-white px-1">/newbot</code>. Copy the token it gives you.
                </li>
                <li>
                  2. Send your new bot any message, then open{" "}
                  <code className="rounded bg-white px-1">api.telegram.org/bot&lt;token&gt;/getUpdates</code> and copy
                  the <code className="rounded bg-white px-1">chat.id</code>.
                </li>
                <li>3. Paste both below and press Send test. For a team, add the bot to a group and use the group id.</li>
              </ol>

              <Input
                label="Bot token"
                type="password"
                placeholder={settings.telegramTokenSet ? `Saved (${settings.telegramTokenHint}) — leave blank to keep` : "123456:ABC-DEF..."}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <Input
                label="Chat ID"
                placeholder="e.g. 123456789 or -1001234567890 for a group"
                value={settings.telegramChatId}
                onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* ---- Web push ---- */}
        <div className="rounded-xl border border-slate-200 p-3.5">
          <div className="flex items-center gap-2">
            <Smartphone className="h-3.5 w-3.5 text-violet-600" />
            <span className="text-xs font-bold text-slate-900">Phone notification</span>
            {webPush?.subscribedDevices > 0 && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                {webPush.subscribedDevices} device{webPush.subscribedDevices === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {!webPush?.available ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              Not configured on this platform yet. Your operator needs to set the push keys.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-[11px] text-slate-600">
                Works with the dashboard closed. On iPhone, add this site to your Home Screen first, then turn it on
                from there — Apple only allows notifications for installed sites.
              </p>
              <Button
                size="sm"
                variant={thisDeviceOn ? "outline" : "primary"}
                onClick={thisDeviceOn ? disablePushHere : enablePushHere}
                disabled={pushBusy}
                className="text-xs"
              >
                {pushBusy ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : thisDeviceOn ? <Check className="mr-1.5 h-3.5 w-3.5" /> : null}
                {thisDeviceOn ? "This device is on — turn off" : "Turn on for this device"}
              </Button>
            </div>
          )}
        </div>

        {/* ---- Email ---- */}
        <div className="rounded-xl border border-slate-200 p-3.5">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.emailEnabled}
              onChange={(e) => setSettings({ ...settings, emailEnabled: e.target.checked })}
              className="rounded border-slate-300"
            />
            <Mail className="h-3.5 w-3.5 text-slate-600" />
            <span className="text-xs font-bold text-slate-900">Email</span>
          </label>
          {settings.emailEnabled && (
            <div className="mt-3">
              <Input
                label="Send to"
                placeholder="sales@yourcompany.com, owner@yourcompany.com"
                value={settings.emailTo}
                onChange={(e) => setSettings({ ...settings, emailTo: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Separate several addresses with commas. Slower to arrive than the other two.
              </p>
            </div>
          )}
        </div>

        {results && (
          <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            {results.map((result: any) => (
              <p key={result.channel} className="flex items-center gap-1.5 text-[11px]">
                {result.sent ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                )}
                <span className="font-bold capitalize text-slate-800">{result.channel}</span>
                <span className="text-slate-600">{result.detail}</span>
              </p>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={() => save()} disabled={saving} className="text-xs">
            {saving ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : null}
            Save
          </Button>
          <Button variant="outline" onClick={sendTest} disabled={testing || saving} className="text-xs">
            {testing ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            Send test
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
