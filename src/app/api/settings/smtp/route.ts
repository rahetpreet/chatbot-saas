import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { SMTPProvider } from "@/lib/services/email";

export async function GET(req: NextRequest) {
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
        // Mask password
        config = { ...parsed, pass: parsed.pass ? "********" : "" };
      } catch {}
    }

    return NextResponse.json({ config });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
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

    // Save SMTP configuration
    // If pass is masked, preserve existing password
    let finalPass = pass;
    if (pass === "********") {
      const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (existing?.customSmtpConfig) {
        try {
          finalPass = JSON.parse(existing.customSmtpConfig).pass;
        } catch {}
      }
    }

    const configToSave = {
      host,
      port: Number(port) || 587,
      user,
      pass: finalPass,
      secure: Boolean(secure),
      from: from || user,
    };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { customSmtpConfig: JSON.stringify(configToSave) },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: "SMTP_CONFIG_SAVED",
        details: JSON.stringify({ host, port, user, from }),
      },
    });

    return NextResponse.json({ success: true, message: "SMTP configuration saved." });
  } catch (error: any) {
    console.error("SMTP save/test error:", error);
    return NextResponse.json({ error: error.message || "Failed to configure SMTP" }, { status: 500 });
  }
}
