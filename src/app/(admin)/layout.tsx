"use client";

import React, { useEffect, useState } from "react";
import { Sidebar } from "@/components/ui/Sidebar";
import { Navbar } from "@/components/ui/Navbar";
import { useRouter } from "next/navigation";

export default function ClientAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => {
        setSessionData(data);
      })
      .catch(() => {
        router.push("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const user = sessionData?.user;
  if (!user) {
    return null;
  }
  const tenant = user?.tenant;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar
        role={user?.role}
        tenantName={tenant?.name || "My Workspace"}
        tenantSlug={tenant?.slug || "company"}
        impersonating={sessionData?.impersonating}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Navbar user={user} tenantSlug={tenant?.slug} />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
