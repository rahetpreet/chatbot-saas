"use client";

import React, { useCallback, useEffect, useState } from "react";
import { UserPlus, Copy, Check, KeyRound, Ban, RotateCcw, Headset, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SkeletonList } from "@/components/ui/Loading";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  CLIENT_OWNER: "Owner",
  CLIENT_ADMIN: "Admin",
  CLIENT_AGENT: "Agent",
  CLIENT_VIEWER: "Viewer",
};

const ROLE_HELP: Record<string, string> = {
  CLIENT_ADMIN: "Full access to everything in this workspace.",
  CLIENT_AGENT: "Sees only chats waiting for a person, in the Agent Console.",
  CLIENT_VIEWER: "Can read, but cannot change anything.",
};

/**
 * Team and agent logins.
 *
 * A created password is shown once and never stored in readable form, so the
 * dialog is deliberately blunt about copying it before closing — there is no
 * way to retrieve it afterwards, only to issue a new one.
 */
export function TeamPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [agentUrl, setAgentUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("CLIENT_AGENT");

  const [credentials, setCredentials] = useState<{ email: string; temporaryPassword: string; loginUrl?: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/client/team");
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not load the team.");
        return;
      }
      const data = json.data || json;
      setMembers(data.users || []);
      setAgentUrl(data.agentLoginUrl || "");
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

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/client/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not create that login.");
        return;
      }
      const data = json.data || json;
      setCredentials(data.credentials);
      setName("");
      setEmail("");
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setCreating(false);
    }
  };

  const act = async (userId: string, action: "enable" | "disable" | "reset-password") => {
    if (action === "disable" && !confirm("Disable this login? They will be signed out immediately.")) return;
    try {
      const res = await fetch("/api/client/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "That did not work.");
        return;
      }
      const data = json.data || json;
      if (data.credentials) setCredentials(data.credentials);
      await load();
    } catch {
      setError("Could not reach the server.");
    }
  };

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {credentials && (
        <Card>
          <div className="p-4 border-l-4 border-emerald-500 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-slate-900">Save this password now</p>
                <p className="text-xs text-slate-600">
                  It is stored only as an unreadable hash, so it cannot be shown again. If it is lost, issue a new one
                  with Reset password.
                </p>
              </div>
            </div>

            {[
              { label: "Email", value: credentials.email, key: "cred-email" },
              { label: "Temporary password", value: credentials.temporaryPassword, key: "cred-pass" },
              ...(credentials.loginUrl ? [{ label: "Sign-in link", value: credentials.loginUrl, key: "cred-url" }] : []),
            ].map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 w-32 shrink-0">
                  {row.label}
                </span>
                <code className="flex-1 text-xs bg-slate-100 rounded-lg px-2.5 py-1.5 break-all">{row.value}</code>
                <button
                  type="button"
                  onClick={() => copy(row.value, row.key)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  {copied === row.key ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}

            <Button size="sm" variant="outline" onClick={() => setCredentials(null)}>
              I have saved it
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
              <Headset className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Agent sign-in link</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Give this to your agents. It opens the Agent Console, which shows only the chats waiting for a person.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-100 rounded-lg px-2.5 py-2 break-all">{agentUrl || "…"}</code>
            <button
              type="button"
              onClick={() => copy(agentUrl, "agent-url")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              title="Copy link"
            >
              {copied === "agent-url" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <a
              href={agentUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              title="Open"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </Card>

      <Card>
        <form onSubmit={create} className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Add a team member</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Full name"
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              placeholder="name@company.com"
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="CLIENT_AGENT">Agent</option>
              <option value="CLIENT_ADMIN">Admin</option>
              <option value="CLIENT_VIEWER">Viewer</option>
            </select>
          </div>

          <p className="text-[11px] text-slate-500">{ROLE_HELP[role]}</p>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              {error}
            </div>
          )}

          <Button type="submit" loading={creating} disabled={!email.trim()} className="gap-1.5 font-bold text-xs">
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create login</span>
          </Button>
        </form>
      </Card>

      <Card>
        <div className="p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Team</h3>
          {loading && members.length === 0 ? (
            <SkeletonList rows={3} />
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 flex-wrap ${
                    member.isActive ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-70"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 truncate">{member.name || member.email}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {ROLE_LABELS[member.role] || member.role}
                      </span>
                      {!member.isActive && (
                        <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                          Disabled
                        </span>
                      )}
                      {member.mustChangePassword && member.isActive && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                          Has not signed in
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{member.email}</p>
                  </div>

                  {member.role !== "CLIENT_OWNER" && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => act(member.id, "reset-password")}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                        title="Reset password"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => act(member.id, member.isActive ? "disable" : "enable")}
                        className={`p-1.5 rounded-lg hover:bg-slate-100 ${
                          member.isActive ? "text-red-500" : "text-emerald-600"
                        }`}
                        title={member.isActive ? "Disable this login" : "Enable this login"}
                      >
                        {member.isActive ? <Ban className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
