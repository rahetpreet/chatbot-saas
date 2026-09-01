"use client";

import React from "react";
import Link from "next/link";
import { Sparkles, Bell, ExternalLink } from "lucide-react";
import { Badge } from "./Badge";

interface NavbarProps {
  user?: {
    name: string;
    email: string;
    role: string;
  } | null;
  tenantSlug?: string;
}

export function Navbar({ user, tenantSlug }: NavbarProps) {
  return (
    <header className="h-16 border-b border-slate-200/80 bg-white px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        {tenantSlug && (
          <a
            href={`/c/${tenantSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <span>Live Chat Landing Page</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/dev/email-inbox"
          className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>₹0 Dev Mailbox</span>
        </Link>

        {user && (
          <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200">
              {(user.name || user.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="text-left hidden sm:block">
              <span className="block text-xs font-bold text-slate-800 leading-tight">{user.name || "User"}</span>
              <span className="block text-[11px] text-slate-500 leading-tight">{user.email || ""}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
