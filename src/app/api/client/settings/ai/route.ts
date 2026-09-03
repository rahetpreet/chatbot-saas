import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { validateRequest, aiConfigSchema } from "@/lib/validation";
import { AI_SECRET_FIELDS, decryptJsonFields, encryptJsonFields, getPlatformAiSummary } from "@/lib/security/aiSettings";

export async function GET(_req: NextRequest) {
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
        const parsed = JSON.parse(decryptJsonFields(tenant.aiConfig, AI_SECRET_FIELDS) || "{}");
        // The key itself is never returned; the placeholder tells the form a
        // key exists so it can be left untouched on save.
        config = { ...config, ...parsed, apiKey: parsed.apiKey ? "********" : "" };
      } catch {}
    }

    // A workspace with no key of its own still gets AI when the platform has
    // one configured, and the dashboard should say so rather than implying
    // that AI is unavailable.
    const platform = getPlatformAiSummary();

    return NextResponse.json({ success: true, config, platform, data: { config, platform } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: error.message || "Failed to get AI settings." } }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const body = await req.json();
    
    const validation = await validateRequest(aiConfigSchema, body);
    if (!validation.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: validation.error } }, { status: 400 });

    let finalApiKey = validation.data.apiKey;
    if (validation.data.apiKey === "********") {
      const existing = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { aiConfig: true } });
      if (existing?.aiConfig) {
        try {
          finalApiKey = JSON.parse(decryptJsonFields(existing.aiConfig, AI_SECRET_FIELDS) || "{}").apiKey;
        } catch {}
      }
    }

    const configToSave = {
      enabled: validation.data.enabled,
      provider: validation.data.provider,
      model: validation.data.model,
      baseUrl: validation.data.baseUrl,
      apiKey: finalApiKey || "",
      systemPrompt: validation.data.systemPrompt,
      temperature: validation.data.temperature,
      confidenceThreshold: validation.data.confidenceThreshold,
    };

    // The API key is encrypted at rest; the column previously held it in
    // cleartext, readable by anyone with database access.
    const serialized = encryptJsonFields(JSON.stringify(configToSave), AI_SECRET_FIELDS)!;

    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: { aiConfig: serialized },
      }),
      prisma.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "AI_CONFIG_SAVED",
          details: JSON.stringify({ enabled: configToSave.enabled, provider: configToSave.provider, model: configToSave.model }),
        },
      }),
    ]);

    return NextResponse.json({ success: true, message: "AI settings saved successfully." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to save AI settings" } }, { status: 500 });
  }
}
