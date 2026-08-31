import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess();

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { aiConfig: true },
    });

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
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const body = await req.json();

    let finalApiKey = body.apiKey;
    if (body.apiKey === "********") {
      const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (existing?.aiConfig) {
        try {
          finalApiKey = JSON.parse(existing.aiConfig).apiKey;
        } catch {}
      }
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

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { aiConfig: JSON.stringify(configToSave) },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: "AI_CONFIG_SAVED",
        details: JSON.stringify({ enabled: configToSave.enabled, provider: configToSave.provider, model: configToSave.model }),
      },
    });

    return NextResponse.json({ success: true, message: "AI settings saved successfully." });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save AI settings" }, { status: 500 });
  }
}
