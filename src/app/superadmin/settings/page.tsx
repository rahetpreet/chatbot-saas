"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Lock, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";

export default function SuperAdminSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);
    setChangingPassword(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setPasswordFeedback({ type: "error", msg: data.error || "Failed to update password." });
      } else {
        setPasswordFeedback({
          type: "success",
          msg: "Super Admin password updated successfully! Future logins will require this new password.",
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordFeedback({ type: "error", msg: "Network error occurred." });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Super Admin Security & Password</h1>
        <p className="text-sm text-slate-500">
          Manage your master platform credentials and security policies.
        </p>
      </div>

      <Card>
        <form onSubmit={handlePasswordChange}>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <span>Change Super Admin Password</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Update the master platform password for <span className="font-mono font-semibold text-indigo-600">admin@platform.local</span>. 
              Once changed, all previous sessions will be invalidated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {passwordFeedback && (
              <div
                className={`p-3 rounded-lg text-xs font-medium border flex items-center gap-2 ${
                  passwordFeedback.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-rose-50 text-rose-800 border-rose-200"
                }`}
              >
                {passwordFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{passwordFeedback.msg}</span>
              </div>
            )}

            <Input
              label="Current Password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
            />

            <Input
              label="New Master Password"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters with uppercase, lowercase & numbers"
            />

            <Input
              label="Confirm New Password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new master password"
            />
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" loading={changingPassword} className="font-bold text-xs">
              Update Master Password
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
