"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  Building2,
  Plus,
  ExternalLink,
  Sliders,
  Play,
  Pause,
  AlertOctagon,
  Trash2,
  RefreshCw,
  Search,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [isQuotasModalOpen, setIsQuotasModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);

  // New Tenant Form State
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formAdminEmail, setFormAdminEmail] = useState("");
  const [formAdminName, setFormAdminName] = useState("");
  const [formAdminPassword, setFormAdminPassword] = useState("Password123!");
  const [formPlanTier, setFormPlanTier] = useState("STARTER");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quotas edit state
  const [quotaMessages, setQuotaMessages] = useState(5000);
  const [quotaFlows, setQuotaFlows] = useState(5);
  const [quotaLinks, setQuotaLinks] = useState(50);
  const [quotaStorage, setQuotaStorage] = useState(100);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/tenants");
      const data = await res.json();
      setTenants(data.tenants || []);
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
      const res = await fetch("/api/superadmin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          slug: formSlug,
          adminEmail: formAdminEmail,
          adminName: formAdminName,
          adminPassword: formAdminPassword,
          planTier: formPlanTier,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setFormError(data.error || "Failed to create company");
        setIsSubmitting(false);
        return;
      }

      setIsOnboardModalOpen(false);
      setFormName("");
      setFormSlug("");
      setFormAdminEmail("");
      setFormAdminName("");
      fetchTenants();
    } catch {
      setFormError("Network error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Lifecycle Status Changer
  const handleUpdateStatus = async (tenantId: string, status: string) => {
    try {
      await fetch(`/api/superadmin/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchTenants();
    } catch {
      alert("Failed to update status");
    }
  };

  // 3. Impersonate Tenant
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

  // 4. Save Quotas
  const handleSaveQuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;

    try {
      await fetch(`/api/superadmin/tenants/${selectedTenant.id}`, {
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

  const openQuotasEditor = (tenant: any) => {
    setSelectedTenant(tenant);
    setQuotaMessages(tenant.maxMessagesPerMonth || 5000);
    setQuotaFlows(tenant.maxFlows || 5);
    setQuotaLinks(tenant.maxCampaignLinks || 50);
    setQuotaStorage(tenant.maxStorageMb || 100);
    setIsQuotasModalOpen(true);
  };

  const filteredTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Company & Tenant Lifecycle</h1>
          <p className="text-sm text-slate-500">
            Onboard new businesses, adjust plan quotas, and impersonate client dashboards.
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
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search companies or slugs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
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
                        <span className="text-slate-700">{t.users?.[0]?.email || "-"}</span>
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
        description="Creates a new multi-tenant workspace, initial bot flow, and primary client admin account."
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
              if (!formSlug) setFormSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
            }}
            placeholder="e.g. Acme Corporation"
          />

          <Input
            label="Subdomain / Slug"
            required
            value={formSlug}
            onChange={(e) => setFormSlug(e.target.value)}
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

          <Input
            label="Initial Password"
            type="password"
            required
            value={formAdminPassword}
            onChange={(e) => setFormAdminPassword(e.target.value)}
            placeholder="••••••••"
          />

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsOnboardModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting} className="font-bold">
              Create & Onboard
            </Button>
          </div>
        </form>
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
