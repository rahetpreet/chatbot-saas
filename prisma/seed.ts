import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Chatbot SaaS database...");

  const adminEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || "admin@platform.local").toLowerCase().trim();
  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "AdminSuper2026!#";

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // 1. Check if Super Admin already exists (idempotent check)
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });

  if (!existingSuperAdmin) {
    const superAdmin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "System Super Admin",
        role: "SUPER_ADMIN",
        passwordHash,
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });
    console.log(`✅ Super Admin created: ${superAdmin.email}`);
  } else {
    console.log(`ℹ️ Super Admin already exists: ${existingSuperAdmin.email}`);
  }

  // 2. Create Demo Tenant if none exists
  const existingTenant = await prisma.tenant.findUnique({
    where: { slug: "acme-corp" },
  });

  let demoTenant = existingTenant;
  if (!demoTenant) {
    demoTenant = await prisma.tenant.create({
      data: {
        name: "Acme Corp",
        slug: "acme-corp",
        status: "ACTIVE",
        planTier: "PRO",
        maxMessagesPerMonth: 25000,
        maxFlows: 15,
        maxCampaignLinks: 200,
        maxStorageMb: 500,
        widgetSettings: JSON.stringify({
          primaryColor: "#4f46e5",
          secondaryColor: "#6366f1",
          textColor: "#ffffff",
          botName: "Acme Assistant",
          botSubtitle: "Typically replies instantly",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=Acme",
          launcherStyle: "bubble",
          launcherIcon: "sparkles",
          launcherPosition: "bottom-right",
          greetingBadge: "👋 Need help? Chat with our team!",
          showGreetingBadge: true,
          soundEnabled: true,
          allowedDomains: ["localhost", "127.0.0.1"],
        }),
        aiConfig: JSON.stringify({
          enabled: false,
          provider: "disabled",
          model: "llama3.2",
          systemPrompt: "You are the helpful virtual assistant for Acme Corp.",
          temperature: 0.7,
          confidenceThreshold: 0.6,
        }),
      },
    });
    console.log(`✅ Demo Tenant created: ${demoTenant.name} (${demoTenant.slug})`);

    // 3. Create Client Admin for Demo Tenant
    const clientPassHash = await bcrypt.hash("ClientPass2026!#", 10);
    const clientAdmin = await prisma.user.create({
      data: {
        email: "client@acme.com",
        name: "Alice Johnson",
        role: "CLIENT_ADMIN",
        tenantId: demoTenant.id,
        passwordHash: clientPassHash,
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });
    console.log(`✅ Client Admin created: ${clientAdmin.email}`);

    // 4. Sample Flow Nodes & Edges
    const sampleNodes = [
      {
        id: "node-start",
        type: "start",
        position: { x: 300, y: 50 },
        data: { label: "Conversation Trigger", nodeType: "start" },
      },
      {
        id: "node-welcome",
        type: "message",
        position: { x: 300, y: 180 },
        data: {
          label: "Welcome Greeting",
          nodeType: "message",
          messageText: "👋 Welcome to Acme Corp! I am your interactive assistant.",
        },
      },
      {
        id: "node-menu",
        type: "buttons",
        position: { x: 300, y: 320 },
        data: {
          label: "Main Menu",
          nodeType: "buttons",
          messageText: "How can we best assist you today?",
          inputKey: "selected_intent",
          options: [
            { id: "opt-demo", label: "📅 Book a Product Demo", value: "demo" },
            { id: "opt-pricing", label: "💰 Pricing & Plans", value: "pricing" },
            { id: "opt-support", label: "🛠️ Technical Support", value: "support" },
            { id: "opt-ai", label: "🤖 Ask a Custom Question", value: "ai_ask" },
          ],
        },
      },
      {
        id: "node-demo-name",
        type: "input",
        position: { x: 50, y: 500 },
        data: {
          label: "Ask Name",
          nodeType: "input",
          inputType: "name",
          inputKey: "name",
          inputPlaceholder: "Your full name",
          required: true,
          messageText: "Great! What is your full name?",
        },
      },
      {
        id: "node-demo-email",
        type: "input",
        position: { x: 50, y: 650 },
        data: {
          label: "Ask Email",
          nodeType: "input",
          inputType: "email",
          inputKey: "email",
          inputPlaceholder: "you@company.com",
          required: true,
          messageText: "Thanks {{name}}! What's your business email address?",
        },
      },
      {
        id: "node-demo-close",
        type: "close",
        position: { x: 50, y: 800 },
        data: {
          label: "Demo Confirmation",
          nodeType: "close",
          closingMessage: "🎉 Thank you {{name}}! Our product specialist will email you at {{email}} within 2 hours to confirm your demo.",
          triggerLeadNotification: true,
          resolveSession: true,
        },
      },
      {
        id: "node-pricing-info",
        type: "message",
        position: { x: 300, y: 500 },
        data: {
          label: "Pricing Information",
          nodeType: "message",
          messageText: "Acme Corp plans start at ₹0 during beta and $29/mo for standard business tier with unlimited automation.",
        },
      },
      {
        id: "node-pricing-close",
        type: "close",
        position: { x: 300, y: 650 },
        data: {
          label: "Pricing Close",
          nodeType: "close",
          closingMessage: "Let us know if you have any further questions!",
          resolveSession: true,
        },
      },
      {
        id: "node-support-upload",
        type: "attachment",
        position: { x: 550, y: 500 },
        data: {
          label: "Upload Screenshot",
          nodeType: "attachment",
          inputKey: "error_file",
          uploadPrompt: "Please upload a screenshot or log file of the issue you are experiencing.",
          maxSizeMb: 10,
        },
      },
      {
        id: "node-support-handover",
        type: "handover",
        position: { x: 550, y: 650 },
        data: {
          label: "Human Handover",
          nodeType: "handover",
          handoverMessage: "🔔 Transferring you to our live engineering team. An agent will respond in this chat shortly!",
        },
      },
      {
        id: "node-ai-question",
        type: "ai_fallback",
        position: { x: 800, y: 500 },
        data: {
          label: "AI Knowledge Query",
          nodeType: "ai_fallback",
          aiPrompt: "Answer concisely about Acme Corp. If uncertain, suggest speaking with an agent.",
        },
      },
    ];

    const sampleEdges = [
      { id: "e-start-welcome", source: "node-start", target: "node-welcome" },
      { id: "e-welcome-menu", source: "node-welcome", target: "node-menu" },
      { id: "e-menu-demo", source: "node-menu", target: "node-demo-name", sourceHandle: "opt-demo" },
      { id: "e-demo-name-email", source: "node-demo-name", target: "node-demo-email" },
      { id: "e-demo-email-close", source: "node-demo-email", target: "node-demo-close" },
      { id: "e-menu-pricing", source: "node-menu", target: "node-pricing-info", sourceHandle: "opt-pricing" },
      { id: "e-pricing-close", source: "node-pricing-info", target: "node-pricing-close" },
      { id: "e-menu-support", source: "node-menu", target: "node-support-upload", sourceHandle: "opt-support" },
      { id: "e-support-handover", source: "node-support-upload", target: "node-support-handover" },
      { id: "e-menu-ai", source: "node-menu", target: "node-ai-question", sourceHandle: "opt-ai" },
    ];

    const defaultFlow = await prisma.flow.create({
      data: {
        tenantId: demoTenant.id,
        name: "Acme Main Support & Lead Gen",
        description: "Default multi-branch customer onboarding and support flow",
        status: "PUBLISHED",
        isDefault: true,
        version: 1,
        nodes: JSON.stringify(sampleNodes),
        edges: JSON.stringify(sampleEdges),
        publishedNodes: JSON.stringify(sampleNodes),
        publishedEdges: JSON.stringify(sampleEdges),
      },
    });
    console.log(`✅ Default Flow created: ${defaultFlow.name}`);

    // 5. Sample Campaign & Contacts
    const campaign = await prisma.campaign.create({
      data: {
        tenantId: demoTenant.id,
        name: "Q3 Product Launch Promo",
        slug: "q3-promo",
        flowId: defaultFlow.id,
        metadata: JSON.stringify({ utmSource: "newsletter", utmMedium: "email" }),
        opensCount: 14,
        conversionsCount: 5,
      },
    });

    const sampleContacts = [
      { name: "John Doe", email: "john.doe@techcorp.io", identifier: "USR_101", slug: "john-doe-101" },
      { name: "Sarah Connor", email: "sarah@skynet-defense.com", identifier: "USR_102", slug: "sarah-connor-102" },
      { name: "Bruce Wayne", email: "bruce@wayne-enterprises.com", identifier: "USR_103", slug: "bruce-wayne-103" },
    ];

    for (const c of sampleContacts) {
      await prisma.campaignContact.create({
        data: {
          campaignId: campaign.id,
          tenantId: demoTenant.id,
          contactIdentifier: c.identifier,
          name: c.name,
          email: c.email,
          customUrlSlug: c.slug,
          opensCount: 1,
          status: "OPENED",
          firstOpenedAt: new Date(Date.now() - 3600000 * 5),
          lastOpenedAt: new Date(),
        },
      });
    }
  }

  console.log("\n🎉 Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
