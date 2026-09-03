"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  GitBranch,
  Megaphone,
  MessageSquare,
  Users,
  Palette,
  Settings,
  Mail,
  ShieldAlert,
  Building2,
  Activity,
  Sliders,
  FileText,
  LogOut,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  role?: string;
  tenantName?: string;
  tenantSlug?: string;
  impersonating?: boolean;
}

export function Sidebar({ role = "CLIENT_ADMIN", tenantName = "Company", tenantSlug = "company", impersonating }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const handleStopImpersonation = async () => {
    await fetch("/api/auth/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    window.location.href = "/superadmin/tenants";
  };

  interface NavItem {
    label: string;
    href: string;
    icon: any;
    badge?: string;
  }

  const clientNavItems: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Flow Builder", href: "/flows", icon: GitBranch },
    { label: "Campaigns & Links", href: "/campaigns", icon: Megaphone },
    { label: "Live Conversations", href: "/conversations", icon: MessageSquare },
    { label: "Captured Leads", href: "/leads", icon: Users },
    { label: "Widget Customizer", href: "/widget-customizer", icon: Palette },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  const superAdminNavItems: NavItem[] = [
    { label: "Global Dashboard", href: "/superadmin/dashboard", icon: LayoutDashboard },
    { label: "Companies & Tenants", href: "/superadmin/tenants", icon: Building2 },
    { label: "Platform Usage", href: "/superadmin/quotas", icon: Sliders },
    { label: "System Check", href: "/superadmin/system-check", icon: Activity },
    { label: "System Audit Logs", href: "/superadmin/audit-logs", icon: FileText },
    { label: "Security & Password", href: "/superadmin/settings", icon: ShieldAlert },
  ];

  const isSuperAdminPortal = pathname.startsWith("/superadmin");
  const navItems = isSuperAdminPortal ? superAdminNavItems : clientNavItems;

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen shrink-0 border-r border-slate-800 select-none">
      {/* Impersonation Banner */}
      {impersonating && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 p-2.5 px-3 flex items-center justify-between text-xs text-amber-300">
          <span className="truncate font-medium">Impersonating: {tenantName}</span>
          <button
            onClick={handleStopImpersonation}
            className="ml-2 font-bold underline hover:text-white shrink-0"
          >
            Exit
          </button>
        </div>
      )}

      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 justify-between">
        <Link href={isSuperAdminPortal ? "/superadmin/dashboard" : "/dashboard"} className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black shadow-md shadow-indigo-600/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="font-black text-white text-base tracking-tight block leading-tight">ChatFlow</span>
            <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider block">
              {isSuperAdminPortal ? "Super Admin" : tenantName}
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && item.href !== "/superadmin/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                isActive
                  ? "bg-indigo-600 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0 transition-colors", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200")} />
              <span className="truncate flex-1">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] bg-slate-800 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Switch Portal or Logout */}
      <div className="p-3 border-t border-slate-800 space-y-1">
        {role === "SUPER_ADMIN" && !isSuperAdminPortal && (
          <Link
            href="/superadmin/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Switch to Super Admin</span>
          </Link>
        )}

        {role === "SUPER_ADMIN" && isSuperAdminPortal && (
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Switch to Client Portal</span>
          </Link>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
