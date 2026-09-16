"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  Megaphone,
  Link as LinkIcon,
  GitBranch,
  Users,
  MessageSquare,
  TrendingDown,
  FileBarChart,
} from "lucide-react";

/**
 * Navigation for the reports section.
 *
 * These ten screens each had their own sidebar row, which made the sidebar
 * twenty-five entries long and buried the six things a client uses daily. They
 * belong together, so they are one sidebar entry with tabs here — the section
 * is as reachable as before without dominating the whole navigation.
 */
const TABS = [
  { href: "/analytics", label: "Overview", icon: BarChart3 },
  { href: "/analytics/chatbots", label: "Chatbots", icon: Bot },
  { href: "/analytics/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/analytics/links", label: "Links", icon: LinkIcon },
  { href: "/analytics/flow", label: "Flow", icon: GitBranch },
  { href: "/analytics/drop-off", label: "Drop-off", icon: TrendingDown },
  { href: "/analytics/leads", label: "Leads", icon: Users },
  { href: "/analytics/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/analytics/reports", label: "Reports & Exports", icon: FileBarChart },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      {/* Horizontally scrollable so the tab strip never wraps into two rows or
          pushes the page sideways on a narrow screen. */}
      <nav className="-mx-1 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-1 px-1">
          {TABS.map((tab) => {
            // "/analytics" is the parent of every other tab, so a prefix match
            // would mark Overview active on all nine screens.
            const active = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  active
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {children}
    </div>
  );
}
