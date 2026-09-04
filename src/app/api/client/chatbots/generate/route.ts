import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { getGenerationProviders } from "@/lib/services/ai";
import { FlowNodeData } from "@/types";
import { validateFlowGraph } from "@/lib/services/flow/validation";
import { FLOW_SYSTEM_PROMPT, buildFlowUserPrompt, extractJsonObject, normalizeGeneratedGraph } from "@/lib/services/flow/aiGenerator";
import { readTenantAiConfig } from "@/lib/security/aiSettings";
import { recordUsage } from "@/lib/services/subscription/planLimits";

interface GeneratedGraph {
  name: string;
  description: string;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: FlowNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    label?: string;
  }>;
}

// Extract explicit items listed in the user prompt (e.g. "offers pizza, burger, pasta, drinks" or "1. A, 2. B")
function extractCustomOptionsFromPrompt(prompt: string): Array<{ id: string; label: string; value: string }> | null {
  // Check for bulleted/numbered list: 1. Item, 2. Item OR - Item - Item
  const listMatches = prompt.match(/(?:(?:^|\n|\.\s+)(?:[0-9]+[.)]|-|\*)\s*([^\n,;.]+))/g);
  if (listMatches && listMatches.length >= 2) {
    return listMatches.slice(0, 5).map((m, idx) => {
      const clean = m.replace(/(?:^|\n|\.\s+)(?:[0-9]+[.)]|-|\*)\s*/, "").trim();
      return {
        id: `opt-${idx + 1}`,
        label: clean,
        value: clean.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 25),
      };
    });
  }

  // Check for "offers/menu/services/options/categories/with/offering/provides/sell: A, B, C, D"
  const listKeywordMatch = prompt.match(/(?:offers|menu|services|options|categories|including|like|sell|items|features|order|serves|serve|selling|eat|with|offering|provides)\s*(?::|\s)\s*([^.]+)/i);
  if (listKeywordMatch && listKeywordMatch[1]) {
    // Cut off before "collect" or "ask" or "take" or "need" if present
    const cleanListString = listKeywordMatch[1].split(/\b(collect|take|ask|require|need|get)\b/i)[0];
    const rawItems = cleanListString
      .split(/,|\band\b|;|\//i)
      .map(s => s.trim().replace(/^(?:and|a|an|the)\s+/i, ""))
      .filter(s => s.length > 1 && s.length < 40 && !["etc", "more", "others", "address", "phone", "name", "collect", "take", "ask"].includes(s.toLowerCase()));
    
    if (rawItems.length >= 2) {
      return rawItems.slice(0, 5).map((item, idx) => {
        let emoji = "✨";
        const il = item.toLowerCase();
        if (il.includes("burger")) emoji = "🍔";
        else if (il.includes("pizza")) emoji = "🍕";
        else if (il.includes("fries")) emoji = "🍟";
        else if (il.includes("waffle") || il.includes("cake") || il.includes("dessert")) emoji = "🧇";
        else if (il.includes("dive") || il.includes("scuba") || il.includes("water")) emoji = "🤿";
        else if (il.includes("pentest") || il.includes("security") || il.includes("audit") || il.includes("cyber") || il.includes("team")) emoji = "🛡️";
        else if (il.includes("bath") || il.includes("groom") || il.includes("haircut") || il.includes("nail") || il.includes("shedding")) emoji = "🐾";
        else if (il.includes("solar") || il.includes("roof") || il.includes("battery") || il.includes("power")) emoji = "☀️";
        else if (il.includes("pasta") || il.includes("lasagna")) emoji = "🍝";
        else if (il.includes("biryani") || il.includes("chicken") || il.includes("curry") || il.includes("naan")) emoji = "🍛";
        else if (il.includes("drink") || il.includes("beverage") || il.includes("shake") || il.includes("lassi") || il.includes("juice")) emoji = "🥤";
        else if (il.includes("market") || il.includes("ad")) emoji = "🚀";
        else if (il.includes("web") || il.includes("code") || il.includes("app")) emoji = "💻";
        else if (il.includes("seo") || il.includes("growth")) emoji = "📈";
        else if (il.includes("design") || il.includes("brand")) emoji = "🎨";
        else if (il.includes("book") || il.includes("appoint")) emoji = "📅";
        else if (il.includes("car") || il.includes("drive") || il.includes("rental")) emoji = "🚗";
        else if (il.includes("gym") || il.includes("fitness") || il.includes("workout")) emoji = "🏋️";

        return {
          id: `opt-${idx + 1}`,
          label: `${emoji} ${item}`,
          value: item.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 25),
        };
      });
    }
  }

  return null;
}

function cleanBrandCandidate(name: string): string {
  return name
    .replace(/chatbot|bot|website|flow|ai|restaurant|cafe|store|company|app|salon|academy|school/gi, "")
    .replace(/\b(with|and|for|the|a|an|in|at|by|of|offering|called|named)\b/gi, "")
    .trim();
}

// Extract clean Brand Name from user prompt
function extractBrandName(prompt: string, defaultName: string): string {
  if (!prompt) return defaultName;

  // Look for quotes: 'BrandName' or "BrandName"
  const quoteMatch = prompt.match(/['"]([^'"]+)['"]/);
  if (quoteMatch && quoteMatch[1].length < 35) return cleanBrandCandidate(quoteMatch[1]);

  // Look for "named BRAND" or "called BRAND"
  const namedMatch = prompt.match(/(?:named|called)\s+([A-Za-z0-9_&'-]+(?:\s+[A-Za-z0-9_&'-]+){0,2})/i);
  if (namedMatch && namedMatch[1]) {
    const candidate = cleanBrandCandidate(namedMatch[1]);
    if (candidate.length > 1) return candidate;
  }

  // Look for "we are BRAND" or "i run BRAND"
  const weAreMatch = prompt.match(/(?:we are|i am|i run|this is|welcome to|meet)\s+([A-Za-z0-9_&'-]+(?:\s+[A-Za-z0-9_&'-]+){0,2})/i);
  if (weAreMatch && weAreMatch[1] && !["the", "our", "a", "an", "this", "my", "your", "an authentic", "a fast"].includes(weAreMatch[1].toLowerCase())) {
    const candidate = cleanBrandCandidate(weAreMatch[1]);
    if (candidate.length > 1) return candidate;
  }

  // Look for "for BRAND"
  const forMatch = prompt.match(/(?:for)\s+([A-Za-z0-9_&'-]+(?:\s+[A-Za-z0-9_&'-]+){0,2})/i);
  if (forMatch && forMatch[1] && !["the", "our", "a", "an", "this", "my", "your", "food", "an"].includes(forMatch[1].toLowerCase())) {
    const candidate = cleanBrandCandidate(forMatch[1]);
    if (candidate.length > 1) return candidate;
  }

  // Look for # BRAND
  const hashMatch = prompt.match(/#\s*([A-Za-z0-9_&'-]+(?:\s+[A-Za-z0-9_&'-]+){0,2})/);
  if (hashMatch) {
    const candidate = cleanBrandCandidate(hashMatch[1]);
    if (candidate.length > 1) return candidate;
  }

  // Look for first uppercase word sequence before "website" or "chatbot" or "restaurant"
  const beforeBotMatch = prompt.match(/^([A-Za-z0-9_&'-]+(?:\s+[A-Za-z0-9_&'-]+){0,2})\s+(?:website|chatbot|bot|restaurant|clinic|store|cafe|salon|company|agency)/i);
  if (beforeBotMatch && beforeBotMatch[1]) {
    return cleanBrandCandidate(beforeBotMatch[1]);
  }

  return defaultName || "Our Brand";
}

// Extract requested form input fields from prompt text
interface ExtractedInput {
  key: string;
  type: "text" | "email" | "phone" | "name";
  label: string;
  placeholder: string;
  messageText: string;
  required: boolean;
}

function extractRequestedInputs(prompt: string, brand: string): ExtractedInput[] {
  const p = prompt.toLowerCase();
  const inputs: ExtractedInput[] = [];

  // 1. Order details / item selection (for food / retail)
  if (/\b(order|dish|food|pizza|burger|menu|item|product|buy|purchase)\b/i.test(p)) {
    inputs.push({
      key: "order_items",
      type: "text",
      label: "Order Selection / Items",
      placeholder: "e.g. 2x Dishes, specific requirements, or items",
      messageText: "What items or services would you like to order today?",
      required: true,
    });
  }

  // 2. Specific requirements / details / vehicle / project / property
  if (/\b(vehicle|model|car|site|project|property|case|experience|level|interest|problem|issue)\b/i.test(p) && !inputs.some(i => i.key === "order_items")) {
    inputs.push({
      key: "service_details",
      type: "text",
      label: "Specific Requirements",
      placeholder: "Describe your requirements or specific model/service...",
      messageText: "Please share the details of what you are looking for:",
      required: true,
    });
  }

  // 3. Name (Customer / Client / Patient / Member)
  let nameLabel = "Your Name";
  let nameMsg = "Awesome! May I know your full name?";
  if (p.includes("patient")) {
    nameLabel = "Patient Name";
    nameMsg = "Please enter the patient's full legal name:";
  } else if (p.includes("guest")) {
    nameLabel = "Lead Guest Name";
    nameMsg = "Who is the lead guest for this reservation?";
  } else if (p.includes("client")) {
    nameLabel = "Client Name";
    nameMsg = "Who do we have the pleasure of speaking with? Please enter your full name:";
  }
  inputs.push({
    key: "name",
    type: "name",
    label: nameLabel,
    placeholder: "Your full name",
    messageText: nameMsg,
    required: true,
  });

  // 4. Contact: Email or Phone or WhatsApp or Both
  const wantsEmail = /\b(email|work email|business email|mail)\b/i.test(p);
  const wantsPhone = /\b(phone|mobile|whatsapp|sms|cell|number|call)\b/i.test(p);

  if (wantsEmail || (!wantsPhone && !/\b(food|restaurant|pizza|burger|delivery|auto|car|gym|fitness|clinic|doctor)\b/i.test(p))) {
    inputs.push({
      key: "email",
      type: "email",
      label: "Email Address",
      placeholder: "you@example.com",
      messageText: "Thanks {{name}}! What is your email address?",
      required: true,
    });
  }

  if (wantsPhone || /\b(food|restaurant|pizza|burger|delivery|auto|car|gym|fitness|clinic|doctor|hotel|property|real estate)\b/i.test(p)) {
    inputs.push({
      key: "phone",
      type: "phone",
      label: "Phone / WhatsApp Number",
      placeholder: "+1 (555) 000-0000",
      messageText: "Thanks {{name}}! What phone or WhatsApp number can we reach you at?",
      required: true,
    });
  }

  // 5. Date / Time / Preferred Slot / Timeline
  if (/\b(date|time|slot|schedule|appointment|timeline|when|check-in|booking date|delivery time)\b/i.test(p)) {
    inputs.push({
      key: "preferred_time",
      type: "text",
      label: "Preferred Date & Time",
      placeholder: "e.g. Tomorrow at 3:00 PM or specific date",
      messageText: "When would you prefer this scheduled or delivered?",
      required: true,
    });
  }

  // 6. Address / Location / City / Delivery
  if (/\b(address|delivery address|location|city|neighborhood|zip|deliver)\b/i.test(p)) {
    inputs.push({
      key: "location_address",
      type: "text",
      label: "Address / Location",
      placeholder: "Street address, City or location",
      messageText: "Please provide your address or preferred location:",
      required: true,
    });
  }

  return inputs;
}

// Extract business topic or headline from prompt
function extractBusinessHeadline(prompt: string, brand: string): string {
  // Remove brand name and stopwords
  const clean = prompt
    .replace(new RegExp(brand, "gi"), "")
    .replace(/#\s*[A-Za-z0-9_-]+/g, "")
    .replace(/(?:we are|i am|i run|for|about|chatbot|bot|flow|website|ai|create a|generate a|build a|with|collect|take|and)\b/gi, "")
    .trim();

  if (clean.length > 5) {
    return clean.slice(0, 80);
  }
  return "all your business inquiries and services";
}

// Universal Semantic Flow Compiler for all 1,000+ Industries
function compileFlowFromPrompt(prompt: string, tenantName: string, presetName?: string): GeneratedGraph {
  const brand = extractBrandName(prompt, tenantName);
  const customOptions = extractCustomOptionsFromPrompt(prompt);
  const headline = extractBusinessHeadline(prompt, brand);
  const requestedInputs = extractRequestedInputs(prompt, brand);

  // Dynamic Options: if user provided options use them, else dynamically construct relevant choices
  const options = customOptions || [
    { id: "opt-1", label: `✨ Explore ${brand} Services`, value: "services" },
    { id: "opt-2", label: "💰 Pricing, Rates & Packages", value: "pricing" },
    { id: "opt-3", label: "📅 Book / Place Request", value: "booking" },
    { id: "opt-4", label: "💬 Speak with Specialist", value: "contact" },
  ];

  const nodes: any[] = [];
  const edges: any[] = [];

  // Node 1: Start
  nodes.push({
    id: "node-start",
    type: "start",
    position: { x: 300, y: 40 },
    data: { label: "Trigger: Visitor Open", nodeType: "start" },
  });

  // Node 2: Welcome Message (tailored dynamically to brand and business prompt)
  const welcomeText = `👋 Welcome to ${brand}! We are ready to assist you with ${headline}. How would you like us to help you today?`;
  nodes.push({
    id: "node-welcome",
    type: "message",
    position: { x: 300, y: 160 },
    data: {
      label: `${brand} Greeting`,
      nodeType: "message",
      messageText: welcomeText,
    },
  });
  edges.push({ id: "e-start-welcome", source: "node-start", target: "node-welcome" });

  // Node 3: Interactive Menu Buttons
  nodes.push({
    id: "node-menu",
    type: "buttons",
    position: { x: 300, y: 290 },
    data: {
      label: "Interactive Menu",
      nodeType: "buttons",
      messageText: "Please select an option to get started:",
      inputKey: "selected_option",
      options,
    },
  });
  edges.push({ id: "e-welcome-menu", source: "node-welcome", target: "node-menu" });

  // Input Nodes Chain
  let currentY = 460;
  let prevNodeId = "";

  requestedInputs.forEach((input, index) => {
    const nodeId = `node-input-${index + 1}`;
    nodes.push({
      id: nodeId,
      type: "input",
      position: { x: 120, y: currentY },
      data: {
        label: input.label,
        nodeType: "input",
        inputType: input.type,
        inputKey: input.key,
        inputPlaceholder: input.placeholder,
        required: input.required,
        messageText: input.messageText,
      },
    });

    if (index === 0) {
      // Connect first 3 option handles from menu to first input
      options.slice(0, Math.max(1, options.length - 1)).forEach((opt) => {
        edges.push({
          id: `e-menu-${opt.id}-${nodeId}`,
          source: "node-menu",
          target: nodeId,
          sourceHandle: opt.id,
        });
      });
    } else {
      edges.push({
        id: `e-${prevNodeId}-${nodeId}`,
        source: prevNodeId,
        target: nodeId,
      });
    }

    prevNodeId = nodeId;
    currentY += 140;
  });

  // Closing Confirmation Node
  const closeNodeId = "node-confirm-close";
  const closeMsg = `🎉 Thank you {{name}}! Your request with ${brand} has been received. Our team will review your details and get back to you shortly!`;
  nodes.push({
    id: closeNodeId,
    type: "close",
    position: { x: 120, y: currentY },
    data: {
      label: "Request Confirmation",
      nodeType: "close",
      closingMessage: closeMsg,
      resolveSession: true,
    },
  });

  if (prevNodeId) {
    edges.push({ id: `e-${prevNodeId}-${closeNodeId}`, source: prevNodeId, target: closeNodeId });
  }

  // Handover Node (for "Speak with Team / Contact" branch)
  const handoverNodeId = "node-live-handover";
  nodes.push({
    id: handoverNodeId,
    type: "handover",
    position: { x: 520, y: 460 },
    data: {
      label: "Live Team Handover",
      nodeType: "handover",
      handoverMessage: `🔔 Transferring you to an available team member at ${brand}. Please hold on for a moment...`,
    },
  });

  if (options.length > 0) {
    const lastOpt = options[options.length - 1];
    edges.push({
      id: `e-menu-${lastOpt.id}-handover`,
      source: "node-menu",
      target: handoverNodeId,
      sourceHandle: lastOpt.id,
    });
  }

  return {
    name: `${brand} Conversational Flow`,
    description: `Intelligent multi-step flow generated for ${brand}: "${prompt.slice(0, 60)}..."`,
    nodes,
    edges,
  };
}

/** Node types the flow engine and the builder both understand. */

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const body = await req.json();
    const { prompt, templatePreset } = body;

    if (!prompt && !templatePreset) {
      return NextResponse.json({ error: "Please describe what chatbot flow you want to build." }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, aiConfig: true, maxFlows: true },
    });

    let generated: GeneratedGraph | null = null;
    let generatedBy = "compiler";
    let aiError: string | null = null;

    // 1. Real model first, trying each configured provider in turn. Free tiers
    // shed load independently, so a second provider turns "the AI produced
    // nonsense" (really: the fallback ran) into a non-event.
    const generators = getGenerationProviders(readTenantAiConfig(tenant?.aiConfig));
    for (const generator of generators) {
      try {
        const completion = await generator.complete({
          system: FLOW_SYSTEM_PROMPT,
          temperature: 0.4,
          json: true,
          user: buildFlowUserPrompt(String(prompt || templatePreset), tenant?.name || "our company"),
        });

        void recordUsage(tenantId, "ai_messages", 1);
        const normalized = normalizeGeneratedGraph(extractJsonObject(completion));
        if (normalized) {
          generated = normalized;
          generatedBy = "ai";
          aiError = null;
          break; // first provider that produces a usable graph wins
        }
        aiError = `${generator.providerName} returned a graph that could not be validated.`;
        console.warn(`[flow-generate] ${aiError}`);
      } catch (error: any) {
        aiError = `${generator.providerName}: ${error?.message || "request failed"}`;
        console.warn(`[flow-generate] ${aiError} — trying the next provider`);
      }
    }

    if (!generated && generators.length === 0) {
      aiError = "No AI provider is configured.";
    }

    // 2. Intelligent Dynamic Prompt Compiler
    if (!generated) {
      generated = compileFlowFromPrompt(prompt || templatePreset || "Business Assistant", tenant?.name || "Acme Corp", templatePreset);
    }

    const [createdFlow] = await prisma.$transaction([
      prisma.flow.create({
        data: {
          tenantId,
          name: generated.name || "AI Generated Chatbot Flow",
          description: generated.description || `Generated from prompt: "${prompt?.slice(0, 50) || "Preset"}"`,
          status: "DRAFT",
          version: 1,
          nodes: JSON.stringify(generated.nodes),
          edges: JSON.stringify(generated.edges),
        },
      }),
      prisma.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "FLOW_AI_GENERATED",
          details: JSON.stringify({ prompt, name: generated.name }),
        },
      }),
    ]);

    // Surface structural problems now rather than at publish time.
    const validationErrors = validateFlowGraph(generated.nodes, generated.edges);

    return NextResponse.json({
      success: true,
      flow: createdFlow,
      data: { flow: createdFlow },
      generatedBy,
      validationErrors,
      // Non-fatal: the flow was still created using the deterministic compiler.
      aiError: generatedBy === "ai" ? null : aiError,
    });
  } catch (error: any) {
    console.error("AI Flow Generation error:", error);
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to generate flow with AI" } }, { status: 500 });
  }
}
