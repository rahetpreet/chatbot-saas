import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { SMTPProvider } from "@/lib/services/email";

export async function GET(_req: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess();

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { customSmtpConfig: true },
    });

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

    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: error.message || "Failed to load SMTP settings" } }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const body = await req.json();
    const { host, port, user, pass, secure, from, testEmail } = body;

    // If testing connection
    if (testEmail) {
      if (!host || !user || !pass) {
        return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Host, user, and password are required to test SMTP" } }, { status: 400 });
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
      const existing = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { customSmtpConfig: true } });
      if (existing?.customSmtpConfig) {
        try {
          finalPass = JSON.parse(existing.customSmtpConfig).pass;
        } catch {}
      }
    }

    const configToSave = {
      host: host || "",
      port: Number(port) || 587,
      user: user || "",
      pass: finalPass || "",
      secure: Boolean(secure),
      from: from || user || "",
    };

    const serialized = JSON.stringify(configToSave);

    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: { customSmtpConfig: serialized },
      }),
      prisma.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "SMTP_CONFIG_SAVED",
          details: JSON.stringify({ host, port, user, from }),
        },
      }),
    ]);

    return NextResponse.json({ success: true, message: "SMTP configuration saved." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to configure SMTP" } }, { status: 500 });
  }
}
