"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Sparkles, ArrowLeft, MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
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
          <h1 className="text-2xl font-black tracking-tight text-white">Reset Password</h1>
        </div>

        <Card className="border-slate-800 bg-slate-950 text-white shadow-2xl">
          {submitted ? (
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/20">
                <MailCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Instructions Sent</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                If an account exists for <span className="text-white font-semibold">{email}</span>, a password reset link has been dispatched to your inbox.
              </p>
              <div className="pt-2">
                <Link href="/login">
                  <Button variant="outline" className="w-full bg-slate-900 border-slate-800 text-white hover:bg-slate-800">
                    Return to Login
                  </Button>
                </Link>
              </div>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle className="text-xl text-white">Forgot Password</CardTitle>
                <CardDescription className="text-slate-400">
                  Enter your email address and we will generate a secure reset link
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  label="Registered Email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="bg-slate-900 border-slate-800 text-white"
                />
                <Button type="submit" loading={loading} className="w-full">
                  Send Reset Link
                </Button>
              </CardContent>
              <CardFooter className="border-slate-800 justify-center">
                <Link href="/login" className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </Link>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
