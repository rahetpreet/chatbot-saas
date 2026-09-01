import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import { hashPassword } from "@/lib/services/auth/jwt";
import { slugify } from "@/lib/utils";
import { sendAppEmail } from "@/lib/services/email";

import mockStore from "@/lib/mockStore";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin();

    let tenants: any[] = [];
    try {
      tenants = await prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              flows: true,
              conversations: true,
              leads: true,
              campaigns: true,
              users: true,
            },
          },
          users: {
            select: { id: true, email: true, name: true, role: true, status: true },
          },
        },
      });
    } catch (dbErr) {
      console.warn("Tenants DB query notice (using mockStore):", dbErr);
      tenants = mockStore.tenants;
    }

    return NextResponse.json({ tenants });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const superAdmin = await requireSuperAdmin();
    const body = await req.json();

    const {
      name,
      slug: rawSlug,
      adminEmail,
      adminName,
      adminPassword,
      planTier = "STARTER",
      maxMessagesPerMonth = 5000,
      maxFlows = 5,
      maxCampaignLinks = 50,
      maxStorageMb = 100,
    } = body;

    if (!name || !adminEmail || !adminPassword) {
      return NextResponse.json({ error: "Company name, admin email, and password are required" }, { status: 400 });
    }

    const slug = slugify(rawSlug || name);
    const passwordHash = await hashPassword(adminPassword);

    let result: any = null;
    try {
      // Check slug uniqueness
      const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
      if (existingTenant) {
        return NextResponse.json({ error: `Slug '${slug}' is already taken.` }, { status: 400 });
      }

      // Check email uniqueness
      const existingUser = await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase().trim() } });
      if (existingUser) {
        return NextResponse.json({ error: `User with email '${adminEmail}' already exists.` }, { status: 400 });
      }

      // Create Tenant and Admin in a transaction
      result = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name,
            slug,
            planTier,
            maxMessagesPerMonth: Number(maxMessagesPerMonth),
            maxFlows: Number(maxFlows),
            maxCampaignLinks: Number(maxCampaignLinks),
            maxStorageMb: Number(maxStorageMb),
            widgetSettings: JSON.stringify({
              primaryColor: "#4f46e5",
              secondaryColor: "#6366f1",
              textColor: "#ffffff",
              botName: `${name} Assistant`,
              botSubtitle: "Typically replies instantly",
              avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(slug)}`,
              launcherStyle: "bubble",
              launcherIcon: "sparkles",
              launcherPosition: "bottom-right",
              greetingBadge: "👋 Have questions? Chat with us!",
              showGreetingBadge: true,
              soundEnabled: true,
              allowedDomains: [],
            }),
          },
        });

        const admin = await tx.user.create({
          data: {
            tenantId: tenant.id,
            name: adminName || `${name} Admin`,
            email: adminEmail.toLowerCase().trim(),
            passwordHash,
            role: "CLIENT_ADMIN",
            status: "ACTIVE",
          },
        });

        // Create starter default flow
        const starterNodes = [
          {
            id: "node-start",
            type: "start",
            position: { x: 250, y: 50 },
            data: { label: "Trigger: Widget Open", nodeType: "start" },
          },
          {
            id: "node-msg-1",
            type: "message",
            position: { x: 250, y: 180 },
            data: {
              label: "Greeting",
              nodeType: "message",
              messageText: `Welcome to ${name}! How can we help you today?`,
            },
          },
          {
            id: "node-buttons",
            type: "buttons",
            position: { x: 250, y: 320 },
            data: {
              label: "Main Options",
              nodeType: "buttons",
              inputKey: "interest",
              options: [
                { id: "opt-1", label: "💬 Speak to Sales", value: "sales" },
                { id: "opt-2", label: "❓ General Inquiries", value: "inquiries" },
              ],
            },
          },
        ];

        const starterEdges = [
          { id: "e1", source: "node-start", target: "node-msg-1" },
          { id: "e2", source: "node-msg-1", target: "node-buttons" },
        ];

        await tx.flow.create({
          data: {
            tenantId: tenant.id,
            name: "Welcome & Lead Capture Flow",
            status: "PUBLISHED",
            isDefault: true,
            nodes: JSON.stringify(starterNodes),
            edges: JSON.stringify(starterEdges),
            publishedNodes: JSON.stringify(starterNodes),
            publishedEdges: JSON.stringify(starterEdges),
          },
        });

        return { tenant, admin };
      });
    } catch (dbErr) {
      console.warn("DB tenant create notice (using mockStore):", dbErr);
      const createdTenant = mockStore.addTenant(
        {
          name,
          slug,
          planTier,
          maxMessagesPerMonth: Number(maxMessagesPerMonth),
          maxFlows: Number(maxFlows),
          maxCampaignLinks: Number(maxCampaignLinks),
          maxStorageMb: Number(maxStorageMb),
        },
        {
          email: adminEmail.toLowerCase().trim(),
          name: adminName || `${name} Admin`,
        }
      );

      result = {
        tenant: createdTenant,
        admin: {
          id: `u_${slug}_admin`,
          name: adminName || `${name} Admin`,
          email: adminEmail.toLowerCase().trim(),
          role: "CLIENT_ADMIN",
          status: "ACTIVE",
        },
      };
    }

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: result.tenant.id,
          userId: superAdmin.userId,
          action: "TENANT_CREATED",
          details: JSON.stringify({ name, slug, planTier, adminEmail }),
        },
      });
    } catch (auditErr) {
      console.warn("DB audit log create notice:", auditErr);
    }

    // Notify user by email that their account and workspace have been created
    try {
      const host = req.headers.get("host") || "localhost:3000";
      const protocol = req.headers.get("x-forwarded-proto") || "http";
      const loginUrl = `${protocol}://${host}/login`;

      await sendAppEmail({
        to: adminEmail,
        subject: `Account Created - Welcome to ${name} on Chatbot Platform`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
            <h2 style="color: #4338ca;">Welcome to the Platform, ${adminName || name}!</h2>
            <p>Your new company workspace <strong>${name}</strong> has been successfully configured and activated.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Workspace Slug:</strong> <code style="color: #4f46e5;">${slug}</code></p>
              <p style="margin: 4px 0;"><strong>Login Email:</strong> ${adminEmail}</p>
              <p style="margin: 4px 0;"><strong>Temporary Password:</strong> ${adminPassword}</p>
            </div>
            <p style="margin: 20px 0;">
              <a href="${loginUrl}" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Log In to Workspace Dashboard
              </a>
            </p>
            <p style="color: #64748b; font-size: 12px; margin-top: 24px;">Please change your password after logging in for the first time.</p>
          </div>
        `,
        text: `Your account for workspace ${name} has been created. Login at: ${loginUrl} with email: ${adminEmail} and password: ${adminPassword}`,
      });
    } catch (emailErr) {
      console.warn("Could not send account creation notification email:", emailErr);
    }

    return NextResponse.json({
      success: true,
      tenant: result.tenant,
      admin: { id: result.admin.id, email: result.admin.email, name: result.admin.name },
    });
  } catch (error: any) {
    console.error("Create tenant error:", error);
    return NextResponse.json({ error: error.message || "Failed to create tenant" }, { status: 500 });
  }
}
