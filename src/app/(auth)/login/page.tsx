"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Sparkles, Shield, Building2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const errorMsg =
          typeof data.error === "string"
            ? data.error
            : data.error?.message || "Invalid email or password";
        setError(errorMsg);
        setLoading(false);
        return;
      }

      const user = data.user || data.data?.user;
      if (user?.role === "SUPER_ADMIN") {
        router.push("/superadmin/dashboard");
      } else if (user?.role === "CLIENT_AGENT") {
        // Agents work the handover queue; the client dashboard is not theirs
        // to navigate, and the server refuses most of it anyway.
        router.push("/agent");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch {
      setError("Network connection error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">ChatFlow Platform</h1>
          <p className="text-sm text-slate-400">Sign in to your dashboard</p>
        </div>

        <Card className="border-slate-800 bg-slate-950 text-white shadow-2xl">
          <form onSubmit={handleSubmit}>
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl text-white">Account Login</CardTitle>
              <CardDescription className="text-slate-400">
                Enter your registered credentials to access your portal
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                  {error}
                </div>
              )}

              <Input
                label="Email Address"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="bg-slate-900 border-slate-800 text-white focus-visible:ring-indigo-500"
              />

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
                  <Link href="/forgot-password" className="text-xs text-indigo-400 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex h-9 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-white shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
              </div>

              <Button type="submit" loading={loading} className="w-full font-bold">
                Sign In
              </Button>
            </CardContent>
          </form>

          {/* Production Enterprise Security Note */}
          <CardFooter className="flex items-center justify-center gap-2 border-t border-slate-800/80 py-3.5 bg-slate-900/40 rounded-b-xl text-[11px] text-slate-500">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            <span>Secured with 256-bit encryption & multi-tenant isolation</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
