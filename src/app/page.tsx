import Link from "next/link";
import {
  Sparkles,
  GitBranch,
  Megaphone,
  MessageSquare,
  Shield,
  Layers,
  ArrowRight,
  CheckCircle2,
  Code2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { headers } from "next/headers";
import { resolveTenantByHost } from "@/lib/services/tenant/domainResolver";
import { CampaignChatContent } from "@/components/chat/HostedChat";

/**
 * The root route is shared between the marketing site and any workspace that
 * has connected its own hostname. Resolving here rather than in middleware
 * keeps the lookup on the Node runtime, where Prisma can reach the database.
 */
export default async function RootPage() {
  const host = (await headers()).get("host");
  const tenant = await resolveTenantByHost(host);

  // A connected custom domain serves that workspace's chat at the root, with
  // no /c/<slug> path, so the white-labelling is complete.
  if (tenant) return <CampaignChatContent tenantSlug={tenant.slug} />;

  return <MarketingHome />;
}

function MarketingHome() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black shadow-lg shadow-indigo-600/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-black text-white text-lg tracking-tight">ChatFlow SaaS</span>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button size="sm" className="font-bold text-xs shadow-md shadow-indigo-600/30">
                <span>Sign In / Portal</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-950/80 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Next-Gen Enterprise Conversational AI & Lead Platform</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight">
          Visual No-Code Chatbot <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-400">
            & Lead Generation Platform
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Build automated conversational decision trees, deploy lightweight Shadow DOM widgets, batch-generate trackable campaign links with QR codes, and manage live leads.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link href="/login">
            <Button size="lg" className="font-black text-sm px-8 shadow-xl shadow-indigo-600/30">
              <span>Open Admin Dashboard</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <a
            href="/c/acme-corp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 h-11 rounded-lg border border-slate-700 bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-colors shadow-sm"
          >
            <span>Live Chat Demo</span>
          </a>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-800/80">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <GitBranch className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Visual Drag-and-Drop Canvas</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              10 dynamic node types including Message, Quick Replies, Form Inputs, File Uploads, IF/ELSE Condition branches, Webhooks, and Live Handover.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600/20 text-sky-400 flex items-center justify-center">
              <Code2 className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Isolated Shadow DOM Widget</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Zero host-CSS collisions, mobile-responsive sliding drawer, typing indicators, synthesized audio chimes, and persistent local storage.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <Megaphone className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Trackable Campaign Generator</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              CSV contact bulk import, batch personalized chat URLs, real-time open tracker, and instant SVG/PNG QR code downloads.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        <p>ChatFlow SaaS • 100% Free-First Zero Cost Open-Source Architecture</p>
      </footer>
    </div>
  );
}
