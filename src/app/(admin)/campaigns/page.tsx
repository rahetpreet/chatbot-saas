"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  Megaphone,
  Plus,
  QrCode,
  Upload,
  Copy,
  ExternalLink,
  Users,
  Eye,
  CheckCircle2,
  Download,
  RefreshCw,
  Link2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [flows, setFlows] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantSlug, setTenantSlug] = useState<string>('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [shorteningLinks, setShorteningLinks] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Form states
  const [newCampName, setNewCampName] = useState("");
  const [newCampSlug, setNewCampSlug] = useState("");
  const [newCampFlowId, setNewCampFlowId] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRawText, setCsvRawText] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrTargetUrl, setQrTargetUrl] = useState<string>("");
  const [qrContactSlug, setQrContactSlug] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const [campRes, flowsRes] = await Promise.all([
        fetch("/api/client/campaigns"),
        fetch("/api/client/chatbots"),
      ]);
      const campData = await campRes.json();
      const flowsData = await flowsRes.json();
      setCampaigns(campData.campaigns || []);
      setFlows(flowsData.flows || []);

      if (campData.campaigns && campData.campaigns.length > 0 && !selectedCampaign) {
        loadCampaignDetails(campData.campaigns[0].id);
      }
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCampaignDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/client/campaigns/${id}`);
      const data = await res.json();
      if (data.campaign) {
        setSelectedCampaign(data.campaign);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    const fetchTenantSlug = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        const user = data.user || data.data?.user;
        if (user?.tenant?.slug) {
          setTenantSlug(user.tenant.slug);
        }
      } catch {}
    };
    fetchTenantSlug();
  }, []);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/client/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCampName,
          slug: newCampSlug,
          flowId: newCampFlowId || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsCreateModalOpen(false);
        setNewCampName("");
        setNewCampSlug("");
        fetchCampaigns();
      }
    } catch {
      alert("Failed to create campaign");
    }
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    setImporting(true);

    try {
      const formData = new FormData();
      if (csvFile) {
        formData.append("file", csvFile);
      } else if (csvRawText) {
        formData.append("csvText", csvRawText);
      } else {
        alert("Please select a CSV file or paste CSV text.");
        setImporting(false);
        return;
      }

      const res = await fetch(`/api/client/campaigns/${selectedCampaign.id}/import-csv`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setIsCsvModalOpen(false);
        setCsvFile(null);
        setCsvRawText("");
        loadCampaignDetails(selectedCampaign.id);
        alert(data.message);
      } else {
        alert(data.error || "CSV import error");
      }
    } catch {
      alert("Network error during CSV import");
    } finally {
      setImporting(false);
    }
  };

  const openQrModal = async (campaignId: string, contactSlug?: string) => {
    setQrContactSlug(contactSlug || null);
    try {
      let url = `/api/client/campaigns/${campaignId}/qr`;
      if (contactSlug) url += `?contactSlug=${contactSlug}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setQrDataUrl(data.dataUrl);
        setQrTargetUrl(data.targetUrl);
        setIsQrModalOpen(true);
      }
    } catch {
      alert("Failed to generate QR code");
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(id);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleExportContacts = async (withShortLinks = false) => {
    if (!selectedCampaign) return;
    if (withShortLinks) setShorteningLinks(true);
    try {
      const query = withShortLinks ? "?short=1" : "";
      const res = await fetch(`/api/client/campaigns/${selectedCampaign.id}/export-contacts${query}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedCampaign.slug}-contacts${withShortLinks ? "-short" : ""}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to export contacts. Please try again.");
    } finally {
      setShorteningLinks(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Campaign & Trackable Links</h1>
          <p className="text-sm text-slate-500">
            Generate unique personalized chat links, bulk import contacts from CSV, and track real-time open analytics.
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} className="gap-1.5 text-xs font-bold shadow-sm">
          <Plus className="w-4 h-4" />
          <span>New Campaign</span>
        </Button>
      </div>

      {/* Main 2-Pane: Campaigns Selector & Contact Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Campaigns List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Your Campaigns</h3>
          {campaigns.length === 0 ? (
            <Card className="p-6 text-center text-xs text-slate-400">
              No campaigns created yet. Click "New Campaign" to generate your first link!
            </Card>
          ) : (
            campaigns.map((camp) => {
              const isSelected = selectedCampaign?.id === camp.id;
              return (
                <div
                  key={camp.id}
                  onClick={() => loadCampaignDetails(camp.id)}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    isSelected
                      ? "border-indigo-600 bg-white shadow-md ring-2 ring-indigo-500/10"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-sm text-slate-900 truncate">{camp.name}</h4>
                    <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded">
                      /{camp.slug}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span>{camp._count?.contacts || 0} Contacts</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-600">
                      <Eye className="w-3.5 h-3.5" />
                      <span>{camp.opensCount} Total Opens</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right 2 Columns: Contact Book & Batch Links Viewer */}
        <div className="lg:col-span-2 space-y-4">
          {selectedCampaign ? (
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                <div>
                  <CardTitle className="text-lg">{selectedCampaign.name}</CardTitle>
                  <CardDescription className="text-xs">
                    Campaign Slug: <span className="font-mono text-indigo-600 font-semibold">{selectedCampaign.slug}</span>
                  </CardDescription>
                  {/* Generic Campaign Link */}
                  {tenantSlug && (
                    <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Generic Campaign Link (no contact tracking)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-emerald-800 truncate flex-1">
                          {`${typeof window !== 'undefined' ? window.location.origin : ''}/c/${tenantSlug}?campaign=${selectedCampaign.slug}`}
                        </span>
                        <button
                          onClick={() => copyToClipboard(`${window.location.origin}/c/${tenantSlug}?campaign=${selectedCampaign.slug}`, 'generic-link')}
                          className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-colors shrink-0"
                          title="Copy Generic Link"
                        >
                          {copySuccess === 'generic-link' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openQrModal(selectedCampaign.id)}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Campaign QR Code</span>
                  </Button>
                  {(selectedCampaign.contacts || []).length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExportContacts(false)}
                      className="gap-1.5 text-xs font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Contacts</span>
                    </Button>
                  )}
                  {(selectedCampaign.contacts || []).length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={shorteningLinks}
                      onClick={() => handleExportContacts(true)}
                      className="gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                      title="Exports the same contacts with a short link per row, sized for SMS"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>{shorteningLinks ? "Shortening…" : "Export + Short Links"}</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setIsCsvModalOpen(true)}
                    className="gap-1.5 text-xs font-bold bg-indigo-600 text-white"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Bulk Import CSV</span>
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold bg-slate-50">
                      <tr>
                        <th className="p-3">Contact</th>
                        <th className="p-3">Unique Chat Link</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Opens</th>
                        <th className="p-3">Last Opened</th>
                        <th className="p-3 text-right">QR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedCampaign.contacts || []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400">
                            No personalized links generated yet. Click "Bulk Import CSV" to upload a list of contacts!
                          </td>
                        </tr>
                      ) : (
                        selectedCampaign.contacts.map((contact: any) => {
                          const chatUrl = `${window.location.origin}/c/${tenantSlug}?campaign=${selectedCampaign.slug}&contact=${contact.customUrlSlug}`;
                          return (
                            <tr key={contact.id} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-slate-900">
                                {contact.name || contact.contactIdentifier}
                                {contact.email && (
                                  <span className="block text-[11px] font-normal text-slate-500">{contact.email}</span>
                                )}
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-1.5 max-w-xs">
                                  <span className="font-mono text-[11px] text-slate-600 truncate">{chatUrl}</span>
                                  <button
                                    onClick={() => copyToClipboard(chatUrl, contact.id)}
                                    className="p-1 rounded hover:bg-slate-200 text-slate-500 shrink-0"
                                    title="Copy Link"
                                  >
                                    {copySuccess === contact.id ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                              <td className="p-3">
                                <Badge
                                  variant={contact.status === "OPENED" ? "success" : "default"}
                                  className="text-[10px]"
                                >
                                  {contact.status}
                                </Badge>
                              </td>
                              <td className="p-3 font-bold text-slate-800">{contact.opensCount}</td>
                              <td className="p-3 text-slate-500 whitespace-nowrap">
                                {formatDate(contact.lastOpenedAt)}
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => openQrModal(selectedCampaign.id, contact.customUrlSlug)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-indigo-600 transition-colors"
                                  title="View QR Code"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="p-12 text-center text-slate-400 text-sm">
              Select or create a campaign to manage links and contacts.
            </Card>
          )}
        </div>
      </div>

      {/* New Campaign Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Campaign"
        description="Configure a new promotional campaign and generate custom tracking URLs."
      >
        <form onSubmit={handleCreateCampaign} className="space-y-4 text-xs">
          <Input
            label="Campaign Name"
            required
            value={newCampName}
            onChange={(e) => {
              setNewCampName(e.target.value);
              if (!newCampSlug) setNewCampSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
            }}
            placeholder="e.g. Q4 Black Friday Promo"
          />

          <Input
            label="URL Campaign Identifier (Slug)"
            required
            value={newCampSlug}
            onChange={(e) => setNewCampSlug(e.target.value)}
            placeholder="bf-promo"
          />

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Assign Specific Bot Flow (Optional)
            </label>
            <select
              value={newCampFlowId}
              onChange={(e) => setNewCampFlowId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-medium"
            >
              <option value="">Default Live Workspace Flow</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (v{f.version})
                </option>
              ))}
            </select>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="font-bold">
              Create Campaign
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bulk CSV Upload Modal */}
      <Modal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        title="Bulk Import Contacts & Generate URLs"
        description="Upload a CSV with Name, Email, Phone columns. Unique trackable links will be generated automatically."
      >
        <form onSubmit={handleImportCsv} className="space-y-4 text-xs">
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors">
            <Upload className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-800">Choose a CSV file from your computer</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Headers supported: Name, Email, Phone, Company</p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              className="mt-3 text-xs"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-white px-2 text-slate-400 font-bold">Or paste CSV content directly</span>
            </div>
          </div>

          <Textarea
            placeholder="Name,Email,Phone&#10;John Doe,john@example.com,+123456789&#10;Alice Smith,alice@example.com,+987654321"
            value={csvRawText}
            onChange={(e) => setCsvRawText(e.target.value)}
            rows={4}
          />

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsCsvModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={importing} className="font-bold">
              Generate Batch Links
            </Button>
          </div>
        </form>
      </Modal>

      {/* QR Code Viewer Modal (Zero-Cost Local Generation) */}
      <Modal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        title="Local QR Code (₹0 Cost)"
        description="High-resolution QR code generated on-device without third-party APIs."
      >
        <div className="flex flex-col items-center space-y-4 text-center">
          {qrDataUrl && (
            <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-md">
              <img src={qrDataUrl} alt="Campaign QR Code" className="w-56 h-56" />
            </div>
          )}

          <div className="w-full bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700 break-all">
            {qrTargetUrl}
          </div>

          <div className="flex items-center gap-3 w-full">
            {qrDataUrl && (
              <a
                href={qrDataUrl}
                download={`qr_${selectedCampaign?.slug || "campaign"}.png`}
                className="flex-1 inline-flex items-center justify-center gap-2 p-2.5 rounded-lg bg-indigo-600 text-white font-bold text-xs shadow-sm hover:bg-indigo-700"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </a>
            )}

            {selectedCampaign && (
              <a
                href={`/api/client/campaigns/${selectedCampaign.id}/qr?format=svg${qrContactSlug ? `&contactSlug=${qrContactSlug}` : ""}`}
                download={`qr_${selectedCampaign.slug}.svg`}
                className="flex-1 inline-flex items-center justify-center gap-2 p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Download SVG</span>
              </a>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
