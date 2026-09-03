import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { SMTPProvider } from "@/lib/services/email";
import { validateRequest, smtpConfigSchema } from "@/lib/validation";
import { SMTP_SECRET_FIELDS, decryptJsonFields, encryptJsonFields } from "@/lib/security/crypto";

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
        const parsed = JSON.parse(decryptJsonFields(tenant.customSmtpConfig, SMTP_SECRET_FIELDS) || "{}");
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
    
    const validation = await validateRequest(smtpConfigSchema, body);
    if (!validation.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: validation.error } }, { status: 400 });
    
    const { host, port, user, pass, secure, from, testEmail } = validation.data;

    // If testing connection
    if (testEmail) {
      const smtpProvider = new SMTPProvider({
        host,
        port,
        user,
        pass,
        secure,
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
          finalPass = JSON.parse(decryptJsonFields(existing.customSmtpConfig, SMTP_SECRET_FIELDS) || "{}").pass;
        } catch {}
      }
    }

    const configToSave = {
      host: host || "",
      port: port || 587,
      user: user || "",
      pass: finalPass || "",
      secure: secure || false,
      from: from || user || "",
    };

    // The SMTP password is encrypted at rest rather than stored in cleartext.
    const serialized = encryptJsonFields(JSON.stringify(configToSave), SMTP_SECRET_FIELDS)!;

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
