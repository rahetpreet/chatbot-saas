import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

import mockStore from "@/lib/mockStore";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "t_acme_corp" : session.tenantId || "t_acme_corp");

    let tenant: any = null;
    try {
      tenant = await prisma.tenant.findUnique({
        where: { id: effectiveTenantId },
        select: { aiConfig: true },
      });
    } catch (dbErr) {
      console.warn("AI settings GET DB notice:", dbErr);
    }

    if (!tenant) {
      tenant = mockStore.getTenant(effectiveTenantId);
    }

    let config = {
      enabled: false,
      provider: "disabled", // disabled, ollama, groq, openrouter, gemini
      model: "llama3.2",
      baseUrl: "http://localhost:11434",
      apiKey: "",
      systemPrompt: "You are the helpful virtual assistant for our company.",
      temperature: 0.7,
      confidenceThreshold: 0.6,
    };

    if (tenant?.aiConfig) {
      try {
        const parsed = JSON.parse(tenant.aiConfig);
        config = { ...config, ...parsed, apiKey: parsed.apiKey ? "********" : "" };
      } catch {}
    }

    return NextResponse.json({ config });
  } catch (error: any) {
    return NextResponse.json({ config: { enabled: false, provider: "disabled", model: "llama3.2", baseUrl: "http://localhost:11434", apiKey: "", systemPrompt: "You are the helpful virtual assistant for our company.", temperature: 0.7, confidenceThreshold: 0.6 } });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "t_acme_corp" : session.tenantId || "t_acme_corp");
    const body = await req.json();

    let finalApiKey = body.apiKey;
    if (body.apiKey === "********") {
      try {
        const existing = await prisma.tenant.findUnique({ where: { id: effectiveTenantId } });
        if (existing?.aiConfig) {
          finalApiKey = JSON.parse(existing.aiConfig).apiKey;
        }
      } catch {}
    }

    const configToSave = {
      enabled: Boolean(body.enabled),
      provider: body.provider || "disabled",
      model: body.model || "llama3.2",
      baseUrl: body.baseUrl || "http://localhost:11434",
      apiKey: finalApiKey,
      systemPrompt: body.systemPrompt || "You are a helpful customer support assistant.",
      temperature: Number(body.temperature) || 0.7,
      confidenceThreshold: Number(body.confidenceThreshold) || 0.6,
    };

    const serialized = JSON.stringify(configToSave);

    try {
      await prisma.tenant.update({
        where: { id: effectiveTenantId },
        data: { aiConfig: serialized },
      });

      await prisma.auditLog.create({
        data: {
          tenantId: effectiveTenantId,
          userId: session.userId,
          action: "AI_CONFIG_SAVED",
          details: JSON.stringify({ enabled: configToSave.enabled, provider: configToSave.provider, model: configToSave.model }),
        },
      });
    } catch (dbErr) {
      console.warn("AI config POST DB notice (using mockStore):", dbErr);
      const existing = mockStore.getTenant(effectiveTenantId);
      if (existing) {
        existing.aiConfig = serialized;
      }
    }

    return NextResponse.json({ success: true, message: "AI settings saved successfully." });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save AI settings" }, { status: 500 });
  }
}
