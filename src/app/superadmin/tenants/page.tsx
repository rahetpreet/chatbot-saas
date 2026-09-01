"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  Plus,
  ExternalLink,
  Sliders,
  Trash2,
  RefreshCw,
  Search,
  KeyRound,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Building2,
} from "lucide-react";

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [isQuotasModalOpen, setIsQuotasModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);

  // New Tenant Form State
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formAdminEmail, setFormAdminEmail] = useState("");
  const [formAdminName, setFormAdminName] = useState("");
  const [formPlanTier, setFormPlanTier] = useState("STARTER");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // One-time credentials state
  const [oneTimeCredentials, setOneTimeCredentials] = useState<{
    companyName: string;
    email: string;
    temporaryPassword: string;
    loginUrl: string;
    slug?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Quotas edit state
  const [quotaMessages, setQuotaMessages] = useState(5000);
  const [quotaFlows, setQuotaFlows] = useState(5);
  const [quotaLinks, setQuotaLinks] = useState(50);
  const [quotaStorage, setQuotaStorage] = useState(100);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tenants");
      const data = await res.json();
      setTenants(data.tenants || data.data?.tenants || []);
    } catch {
      setTenants([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  // 1. Onboard Company
  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          slug: formSlug,
          adminEmail: formAdminEmail,
          adminName: formAdminName,
          planTier: formPlanTier,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setFormError(getApiErrorMessage(data.error, "Failed to create company"));
        return;
      }

      const tempPass = data.credentials?.temporaryPassword;
      if (!tempPass) {
        setFormError("The company was created, but no temporary password was returned. Please reset the client password before sharing access.");
        await fetchTenants();
        return;
      }

      setIsOnboardModalOpen(false);
      setFormName("");
      setFormSlug("");
      setFormAdminEmail("");
      setFormAdminName("");

      // Open One-Time Credentials Modal
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setOneTimeCredentials({
        companyName: data.tenant?.name || formName,
        email: data.credentials?.email || formAdminEmail,
        temporaryPassword: tempPass,
        loginUrl: `${origin}${data.credentials?.loginUrl || "/login"}`,
        slug: data.credentials?.slug || data.tenant?.slug || formSlug,
      });
      setIsCredentialsModalOpen(true);

      fetchTenants();
    } catch {
      setFormError("Network error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Reset Client Password
  const handleResetPassword = async (tenant: any) => {
    if (!confirm(`Generate a new random temporary password for ${tenant.name}?`)) return;

    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/reset-password`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(getApiErrorMessage(data.error, "Failed to reset password"));
        return;
      }

      const tempPass = data.credentials?.temporaryPassword || data.data?.temporaryPassword || data.temporaryPassword;
      const clientEmail = data.credentials?.email || data.data?.email || data.email || tenant.users?.[0]?.email;
      if (tempPass) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        setOneTimeCredentials({
          companyName: tenant.name,
          email: clientEmail,
          temporaryPassword: tempPass,
          loginUrl: `${origin}/login`,
          slug: tenant.slug,
        });
        setIsCredentialsModalOpen(true);
      }
    } catch {
      alert("Failed to reset password");
    }
  };

  // 3. Delete Company
  const handleDeleteTenant = async () => {
    if (!selectedTenant) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/admin/tenants/${selectedTenant.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(getApiErrorMessage(data.error, "Failed to delete company"));
        return;
      }

      setIsDeleteModalOpen(false);
      setSelectedTenant(null);
      setTenants((current) => current.filter((tenant) => tenant.id !== selectedTenant.id));
      await fetchTenants();
    } catch {
      alert("Network error deleting company");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Lifecycle Status Changer
  const handleUpdateStatus = async (tenantId: string, status: string) => {
    try {
      await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchTenants();
    } catch {
      alert("Failed to update status");
    }
  };

  // 5. Impersonate Tenant
  const handleImpersonate = async (tenantId: string) => {
    try {
      const res = await fetch("/api/auth/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = "/dashboard";
      } else {
        alert(data.error || "Impersonation failed");
      }
    } catch {
      alert("Impersonation error");
    }
  };

  // 6. Save Quotas
  const handleSaveQuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;

    try {
      await fetch(`/api/admin/tenants/${selectedTenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxMessagesPerMonth: quotaMessages,
          maxFlows: quotaFlows,
          maxCampaignLinks: quotaLinks,
          maxStorageMb: quotaStorage,
        }),
      });
      setIsQuotasModalOpen(false);
      fetchTenants();
    } catch {
      alert("Failed to save quotas");
    }
  };

  const copyCredentials = () => {
    if (!oneTimeCredentials) return;
    const text = `Chatbot SaaS Workspace Credentials\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCompany: ${oneTimeCredentials.companyName}\nAdmin Login: ${oneTimeCredentials.email}\nTemporary Password: ${oneTimeCredentials.temporaryPassword}\nLogin Portal: ${oneTimeCredentials.loginUrl}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n*Please change your temporary password upon first login.*`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const openQuotasEditor = (tenant: any) => {
    setSelectedTenant(tenant);
    setQuotaMessages(tenant.maxMessagesPerMonth || 5000);
    setQuotaFlows(tenant.maxFlows || 5);
    setQuotaLinks(tenant.maxCampaignLinks || 50);
    setQuotaStorage(tenant.maxStorageMb || 100);
    setIsQuotasModalOpen(true);
  };

  const openDeleteConfirmation = (tenant: any) => {
    setSelectedTenant(tenant);
    setIsDeleteModalOpen(true);
  };

  const filteredTenants = (tenants || []).filter(
    (t) =>
      (t?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (t?.slug || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Company & Tenant Lifecycle</h1>
          <p className="text-sm text-slate-500">
            Onboard new businesses, adjust plan quotas, reset credentials, and manage workspaces.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsOnboardModalOpen(true)} className="gap-1.5 text-xs font-bold shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Onboard New Company</span>
          </Button>
        </div>
      </div>

      {/* Tenants Table Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search companies or slugs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <Button size="sm" variant="outline" onClick={fetchTenants} className="h-8">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <span className="text-xs font-semibold text-slate-500">{filteredTenants.length} Companies Total</span>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold bg-slate-50">
                <tr>
                  <th className="p-3">Company</th>
                  <th className="p-3">Plan Tier</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Primary Admin</th>
                  <th className="p-3">Stats (Flows / Leads)</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No companies found. Click "Onboard New Company" to create one.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{t.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">/{t.slug}</div>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 uppercase">
                          {t.planTier}
                        </span>
                      </td>
                      <td className="p-3">
                        <select
                          value={t.status}
                          onChange={(e) => handleUpdateStatus(t.id, e.target.value)}
                          className={`text-[11px] font-bold rounded-full px-2.5 py-1 border cursor-pointer ${
                            t.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : t.status === "PAUSED"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="PAUSED">PAUSED</option>
                          <option value="SUSPENDED">SUSPENDED</option>
                          <option value="TERMINATED">TERMINATED</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <span className="text-slate-700 font-mono text-[11px]">{t.users?.[0]?.email || "-"}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 text-slate-600">
                          <span>{t._count?.flows || 0} Flows</span>
                          <span>•</span>
                          <span>{t._count?.leads || 0} Leads</span>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Impersonate Button */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleImpersonate(t.id)}
                            className="h-7 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 gap-1"
                            title="Login as Client into their dashboard"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Impersonate</span>
                          </Button>

                          {/* Reset Password Button */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResetPassword(t)}
                            className="h-7 text-[11px] text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100 gap-1"
                            title="Reset Client Password"
                          >
                            <KeyRound className="w-3 h-3" />
                            <span>Reset Pass</span>
                          </Button>

                          {/* Quotas Button */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openQuotasEditor(t)}
                            className="h-7 text-[11px] gap-1"
                            title="Edit Resource Quotas"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Quotas</span>
                          </Button>

                          {/* Delete Button */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDeleteConfirmation(t)}
                            className="h-7 text-[11px] text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 p-1.5"
                            title="Delete Company"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Onboard Company Modal */}
      <Modal
        isOpen={isOnboardModalOpen}
        onClose={() => setIsOnboardModalOpen(false)}
        title="Onboard New Company"
        description="Creates a new multi-tenant workspace, starter flow, and primary client account."
      >
        <form onSubmit={handleOnboard} className="space-y-3 text-xs">
          {formError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}

          <Input
            label="Company Name"
            required
            value={formName}
            onChange={(e) => {
              setFormName(e.target.value);
              if (!formSlug) setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
            }}
            placeholder="e.g. Acme Corporation"
          />

          <Input
            label="Subdomain / Slug"
            required
            value={formSlug}
            onChange={(e) => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="acme-corp"
            helperText="Used for campaign links: /c/acme-corp"
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Admin Full Name"
              value={formAdminName}
              onChange={(e) => setFormAdminName(e.target.value)}
              placeholder="Alice Johnson"
            />
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Plan Tier
              </label>
              <select
                value={formPlanTier}
                onChange={(e) => setFormPlanTier(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-medium"
              >
                <option value="STARTER">Starter</option>
                <option value="PRO">Pro</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </div>
          </div>

          <Input
            label="Admin Login Email"
            type="email"
            required
            value={formAdminEmail}
            onChange={(e) => setFormAdminEmail(e.target.value)}
            placeholder="admin@company.com"
          />

          {/* Secure password generator notice */}
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
            <div className="text-[11px] text-indigo-900 leading-relaxed">
              <span className="font-bold">Cryptographically Secure Password:</span> A high-entropy 16-character
              temporary password will be automatically generated upon creation and displayed for you to copy and share
              with the client.
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsOnboardModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting} className="font-bold">
              Generate & Onboard
            </Button>
          </div>
        </form>
      </Modal>

      {/* One-Time Credentials Modal */}
      <Modal
        isOpen={isCredentialsModalOpen}
        onClose={() => setIsCredentialsModalOpen(false)}
        title="🎉 Credentials Generated"
        description="Save this temporary password now. It is displayed only once."
      >
        {oneTimeCredentials && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-[11px] leading-relaxed">
                <span className="font-bold">Important:</span> This password is shown only once and cannot be retrieved
                later. Copy these details and securely send them to your client.
              </div>
            </div>

            <div className="space-y-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg font-mono">
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-semibold font-sans text-slate-500">Company:</span>
                <span className="font-bold text-slate-900">{oneTimeCredentials.companyName}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-semibold font-sans text-slate-500">Login Email:</span>
                <span className="text-indigo-600 font-bold">{oneTimeCredentials.email}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-semibold font-sans text-slate-500">Temporary Password:</span>
                <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                  {oneTimeCredentials.temporaryPassword}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-semibold font-sans text-slate-500">Login Portal:</span>
                <span className="text-slate-700">{oneTimeCredentials.loginUrl}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button onClick={copyCredentials} className="w-full gap-2 font-bold bg-indigo-600 hover:bg-indigo-700">
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Full Credentials</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="⚠️ Delete Company Workspace"
        description="Are you sure you want to permanently delete this company?"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 leading-relaxed">
            Deleting <span className="font-bold">{selectedTenant?.name}</span> will permanently erase all associated
            chatbot flows, campaign links, visitor conversations, and leads. This action cannot be undone.
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteTenant}
              loading={isSubmitting}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              Permanently Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quotas Editor Modal */}
      <Modal
        isOpen={isQuotasModalOpen}
        onClose={() => setIsQuotasModalOpen(false)}
        title={`Edit Quotas: ${selectedTenant?.name}`}
        description="Configure maximum resource allocations for this company."
      >
        <form onSubmit={handleSaveQuotas} className="space-y-3 text-xs">
          <Input
            label="Monthly Messages Limit"
            type="number"
            value={quotaMessages}
            onChange={(e) => setQuotaMessages(Number(e.target.value))}
          />

          <Input
            label="Max Bot Flows Allowed"
            type="number"
            value={quotaFlows}
            onChange={(e) => setQuotaFlows(Number(e.target.value))}
          />

          <Input
            label="Max Trackable Campaign Links"
            type="number"
            value={quotaLinks}
            onChange={(e) => setQuotaLinks(Number(e.target.value))}
          />

          <Input
            label="Max Storage Allocation (MB)"
            type="number"
            value={quotaStorage}
            onChange={(e) => setQuotaStorage(Number(e.target.value))}
          />

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsQuotasModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="font-bold">
              Save Quotas
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
