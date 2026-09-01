import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { SMTPProvider } from "@/lib/services/email";

import mockStore from "@/lib/mockStore";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "t_acme_corp" : session.tenantId || "t_acme_corp");

    let tenant: any = null;
    try {
      tenant = await prisma.tenant.findUnique({
        where: { id: effectiveTenantId },
        select: { customSmtpConfig: true },
      });
    } catch (dbErr) {
      console.warn("SMTP GET DB notice:", dbErr);
    }

    if (!tenant) {
      tenant = mockStore.getTenant(effectiveTenantId);
    }

    let config = {
      host: "",
      port: 587,
      user: "",
      pass: "",
      secure: false,
      from: "",
    };

    if (tenant?.customSmtpConfig) {
      try {
        const parsed = JSON.parse(tenant.customSmtpConfig);
        config = { ...parsed, pass: parsed.pass ? "********" : "" };
      } catch {}
    }

    return NextResponse.json({ config });
  } catch (error: any) {
    return NextResponse.json({ config: { host: "", port: 587, user: "", pass: "", secure: false, from: "" } });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "t_acme_corp" : session.tenantId || "t_acme_corp");
    const body = await req.json();
    const { host, port, user, pass, secure, from, testEmail } = body;

    // If testing connection
    if (testEmail) {
      if (!host || !user || !pass) {
        return NextResponse.json({ error: "Host, user, and password are required to test SMTP" }, { status: 400 });
      }

      const smtpProvider = new SMTPProvider({
        host,
        port: Number(port) || 587,
        user,
        pass,
        secure: Boolean(secure),
        from: from || user,
      });

      await smtpProvider.sendEmail({
        to: testEmail,
        subject: "SMTP Test Verification - Chatbot SaaS",
        html: "<p>Success! Your custom SMTP server settings are configured properly.</p>",
      });

      return NextResponse.json({ success: true, message: `Test email successfully sent to ${testEmail}` });
    }

    let finalPass = pass;
    if (pass === "********") {
      try {
        const existing = await prisma.tenant.findUnique({ where: { id: effectiveTenantId } });
        if (existing?.customSmtpConfig) {
          finalPass = JSON.parse(existing.customSmtpConfig).pass;
        }
      } catch {}
    }

    const configToSave = {
      host,
      port: Number(port) || 587,
      user,
      pass: finalPass,
      secure: Boolean(secure),
      from: from || user,
    };

    const serialized = JSON.stringify(configToSave);

    try {
      await prisma.tenant.update({
        where: { id: effectiveTenantId },
        data: { customSmtpConfig: serialized },
      });

      await prisma.auditLog.create({
        data: {
          tenantId: effectiveTenantId,
          userId: session.userId,
          action: "SMTP_CONFIG_SAVED",
          details: JSON.stringify({ host, port, user, from }),
        },
      });
    } catch (dbErr) {
      console.warn("SMTP POST DB notice (using mockStore):", dbErr);
      const existing = mockStore.getTenant(effectiveTenantId);
      if (existing) {
        existing.customSmtpConfig = serialized;
      }
    }

    return NextResponse.json({ success: true, message: "SMTP configuration saved." });
  } catch (error: any) {
    console.error("SMTP save/test error:", error);
    return NextResponse.json({ error: error.message || "Failed to configure SMTP" }, { status: 500 });
  }
}
