import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/** Deliberately exposes only the published, public bot configuration. */
function publicConfiguration(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicConfiguration);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(password|secret|token|api.?key|smtp|internal.?note)/i.test(key))
    .map(([key, item]) => [key, publicConfiguration(item)]));
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const bot = await prisma.chatbot.findFirst({ where: { publicId, status: "PUBLISHED", deletedAt: null, tenant: { status: { in: ["TRIAL", "ACTIVE"] }, deletedAt: null } }, select: { name: true, description: true, versions: { where: { status: "PUBLISHED" }, orderBy: { versionNumber: "desc" }, take: 1, select: { versionNumber: true, configJson: true } } } });
  const version = bot?.versions[0];
  if (!bot || !version) return NextResponse.json({ success: false, error: { code: "BOT_NOT_PUBLISHED", message: "Bot configuration is unavailable." } }, { status: 404 });
  let configuration: unknown;
  try { configuration = JSON.parse(version.configJson); } catch { return NextResponse.json({ success: false, error: { code: "BOT_NOT_PUBLISHED", message: "Bot configuration is unavailable." } }, { status: 404 }); }
  return NextResponse.json({ success: true, data: { name: bot.name, description: bot.description, version: version.versionNumber, configuration: publicConfiguration(configuration) } });
}
