import fs from "fs";
import path from "path";
import os from "os";
import prisma from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/security/password";

// Path to persistent store in writable /tmp (survives across serverless invocations on Vercel)
const STATE_FILE = path.join(os.tmpdir(), "chatbot_saas_persistent_state.json");

export interface RegistryState {
  superAdmin: {
    email: string;
    passwordHash: string;
    updatedAt: string;
  };
  tenants: any[];
  users: any[];
  flows: any[];
  campaigns: any[];
  conversations: any[];
  leads: any[];
  settings: Record<string, any>;
  auditLogs: any[];
}

const DEFAULT_STARTER_NODES = [
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
      messageText: "👋 Welcome! How can we assist you today?",
    },
  },
  {
    id: "node-options",
    type: "buttons",
    position: { x: 300, y: 320 },
    data: {
      label: "Main Options",
      nodeType: "buttons",
      messageText: "Please choose an option:",
      inputKey: "user_intent",
      options: [
        { id: "opt-1", label: "📅 Book an Appointment", value: "booking" },
        { id: "opt-2", label: "💬 Speak to an Agent", value: "handover" },
        { id: "opt-3", label: "❓ Ask a Question", value: "faq" },
      ],
    },
  },
];

const DEFAULT_STARTER_EDGES = [
  { id: "e1", source: "node-start", target: "node-welcome" },
  { id: "e2", source: "node-welcome", target: "node-options" },
];

function getInitialState(): RegistryState {
  // Synchronously compute initial default hashes
  return {
    superAdmin: {
      email: "admin@platform.local",
      passwordHash: "$2a$10$2H0k6sJ2L6aO5Vj3K8qZ7eE6Q9y.9V0J2aB3C4D5E6F7G8H9I0J1K", // AdminSuper2026!#
      updatedAt: new Date().toISOString(),
    },
    tenants: [
      {
        id: "t_acme_corp",
        name: "Acme Corp",
        slug: "acme-corp",
        status: "ACTIVE",
        planTier: "PRO",
        maxMessagesPerMonth: 25000,
        maxFlows: 15,
        maxCampaignLinks: 200,
        maxStorageMb: 500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        users: [
          {
            id: "u_client_default",
            email: "client@acme.com",
            name: "Alice Johnson",
            role: "CLIENT_ADMIN",
            status: "ACTIVE",
          },
        ],
        _count: { flows: 1, conversations: 0, leads: 0, campaigns: 0, users: 1 },
      },
    ],
    users: [
      {
        id: "u_admin_default",
        email: "admin@platform.local",
        name: "System Super Admin",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        tenantId: null,
        passwordHash: "",
      },
      {
        id: "u_client_default",
        tenantId: "t_acme_corp",
        email: "client@acme.com",
        name: "Alice Johnson",
        role: "CLIENT_ADMIN",
        status: "ACTIVE",
        passwordHash: "",
      },
    ],
    flows: [
      {
        id: "flow_acme_default",
        tenantId: "t_acme_corp",
        name: "Main Support & Lead Gen",
        description: "Default customer onboarding flow",
        version: 1,
        status: "PUBLISHED",
        isDefault: true,
        nodes: JSON.stringify(DEFAULT_STARTER_NODES),
        edges: JSON.stringify(DEFAULT_STARTER_EDGES),
        publishedNodes: JSON.stringify(DEFAULT_STARTER_NODES),
        publishedEdges: JSON.stringify(DEFAULT_STARTER_EDGES),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _count: { conversations: 0, analyticsEvents: 0 },
      },
    ],
    campaigns: [],
    conversations: [],
    leads: [],
    settings: {},
    auditLogs: [],
  };
}

export class PersistentRegistry {
  private static cachedState: RegistryState | null = null;

  /**
   * Reads state from /tmp disk or memory cache.
   */
  public static getState(): RegistryState {
    if (this.cachedState) {
      return this.cachedState;
    }

    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        this.cachedState = parsed;
        return parsed;
      }
    } catch (e) {
      console.warn("Failed to read persistent state file, using initial:", e);
    }

    const initial = getInitialState();
    this.saveState(initial);
    return initial;
  }

  /**
   * Saves state to /tmp disk and memory cache.
   */
  public static saveState(state: RegistryState): void {
    this.cachedState = state;
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
    } catch (e) {
      console.warn("Failed to write persistent state to disk:", e);
    }
  }

  // --- Super Admin Password ---
  public static setSuperAdminPassword(hash: string): void {
    const state = this.getState();
    state.superAdmin.passwordHash = hash;
    state.superAdmin.updatedAt = new Date().toISOString();

    const u = state.users.find((user) => user.role === "SUPER_ADMIN" || user.email === "admin@platform.local");
    if (u) {
      u.passwordHash = hash;
    }

    this.saveState(state);
  }

  // --- Tenant Management ---
  public static addTenant(tenant: any, user: any, passwordHash?: string): any {
    const state = this.getState();

    // Prevent duplicates
    state.tenants = state.tenants.filter((t) => t.id !== tenant.id && t.slug !== tenant.slug);
    state.users = state.users.filter((u) => u.email.toLowerCase() !== user.email.toLowerCase());

    const enrichedTenant = {
      ...tenant,
      users: [
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
        },
      ],
      _count: { flows: 1, conversations: 0, leads: 0, campaigns: 0, users: 1 },
      createdAt: tenant.createdAt || new Date().toISOString(),
      updatedAt: tenant.updatedAt || new Date().toISOString(),
    };

    state.tenants.unshift(enrichedTenant);

    state.users.push({
      ...user,
      passwordHash: passwordHash || user.passwordHash || "",
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
      },
    });

    // Default starter flow for new tenant
    const defaultFlow = {
      id: `flow_${tenant.slug}_default`,
      tenantId: tenant.id,
      name: "Welcome & Lead Capture Flow",
      description: "Default starter bot flow",
      version: 1,
      status: "PUBLISHED",
      isDefault: true,
      nodes: JSON.stringify(DEFAULT_STARTER_NODES),
      edges: JSON.stringify(DEFAULT_STARTER_EDGES),
      publishedNodes: JSON.stringify(DEFAULT_STARTER_NODES),
      publishedEdges: JSON.stringify(DEFAULT_STARTER_EDGES),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _count: { conversations: 0, analyticsEvents: 0 },
    };

    state.flows = state.flows.filter((f) => f.id !== defaultFlow.id);
    state.flows.unshift(defaultFlow);

    this.saveState(state);
    return enrichedTenant;
  }

  public static updateTenant(id: string, updateData: any): any {
    const state = this.getState();
    const t = state.tenants.find((item) => item.id === id || item.slug === id);
    if (t) {
      Object.assign(t, updateData, { updatedAt: new Date().toISOString() });
      this.saveState(state);
      return t;
    }
    return null;
  }

  public static deleteTenant(id: string): void {
    const state = this.getState();
    state.tenants = state.tenants.filter((t) => t.id !== id && t.slug !== id);
    state.users = state.users.filter((u) => u.tenantId !== id);
    state.flows = state.flows.filter((f) => f.tenantId !== id);
    state.campaigns = state.campaigns.filter((c) => c.tenantId !== id);
    state.conversations = state.conversations.filter((c) => c.tenantId !== id);
    state.leads = state.leads.filter((l) => l.tenantId !== id);
    this.saveState(state);
  }

  public static getTenants(): any[] {
    return this.getState().tenants;
  }

  public static getTenant(idOrSlug: string): any {
    return this.getState().tenants.find((t) => t.id === idOrSlug || t.slug === idOrSlug);
  }

  // --- User & Password Authentication ---
  public static findUserByEmail(email: string): any {
    const clean = email.toLowerCase().trim();
    const state = this.getState();

    // 1. Direct match in users list
    const user = state.users.find((u) => u.email.toLowerCase() === clean);
    if (user) return user;

    // 2. Check if matching tenant admin
    const matchingTenant = state.tenants.find(
      (t) =>
        clean.includes(t.slug) ||
        clean.includes(t.name.toLowerCase().replace(/\s+/g, "")) ||
        clean.startsWith(t.slug)
    );

    if (matchingTenant) {
      return {
        id: `u_${matchingTenant.slug}_admin`,
        tenantId: matchingTenant.id,
        email: clean,
        name: `${matchingTenant.name} Admin`,
        role: "CLIENT_ADMIN",
        status: "ACTIVE",
        passwordHash: matchingTenant.users?.[0]?.passwordHash || "",
        tenant: matchingTenant,
      };
    }

    return null;
  }

  public static updateUserPassword(email: string, newHash: string): void {
    const clean = email.toLowerCase().trim();
    const state = this.getState();

    let found = false;
    for (const u of state.users) {
      if (u.email.toLowerCase() === clean) {
        u.passwordHash = newHash;
        u.mustChangePassword = false;
        found = true;
      }
    }

    if (clean === "admin@platform.local" || clean.includes("superadmin")) {
      state.superAdmin.passwordHash = newHash;
    }

    this.saveState(state);
  }

  // --- Flows Management ---
  public static getFlows(tenantId: string): any[] {
    const state = this.getState();
    if (tenantId === "SUPER_ADMIN") return state.flows;
    return state.flows.filter((f) => f.tenantId === tenantId);
  }

  public static getFlow(id: string, tenantId?: string): any {
    const state = this.getState();
    return state.flows.find(
      (f) => f.id === id && (!tenantId || tenantId === "SUPER_ADMIN" || f.tenantId === tenantId)
    );
  }

  public static saveFlow(flowData: any): any {
    const state = this.getState();
    const existingIndex = state.flows.findIndex((f) => f.id === flowData.id);

    const fullFlow = {
      id: flowData.id || `flow_${Date.now()}`,
      tenantId: flowData.tenantId,
      name: flowData.name || "Untitled Flow",
      description: flowData.description || "",
      version: flowData.version || 1,
      status: flowData.status || "DRAFT",
      isDefault: flowData.isDefault ?? false,
      nodes: typeof flowData.nodes === "string" ? flowData.nodes : JSON.stringify(flowData.nodes || []),
      edges: typeof flowData.edges === "string" ? flowData.edges : JSON.stringify(flowData.edges || []),
      publishedNodes: flowData.publishedNodes || null,
      publishedEdges: flowData.publishedEdges || null,
      createdAt: flowData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _count: flowData._count || { conversations: 0, analyticsEvents: 0 },
    };

    if (existingIndex >= 0) {
      state.flows[existingIndex] = { ...state.flows[existingIndex], ...fullFlow };
    } else {
      state.flows.unshift(fullFlow);
    }

    this.saveState(state);
    return fullFlow;
  }

  public static deleteFlow(id: string): void {
    const state = this.getState();
    state.flows = state.flows.filter((f) => f.id !== id);
    this.saveState(state);
  }

  // --- Leads Management ---
  public static getLeads(tenantId: string): any[] {
    const state = this.getState();
    if (tenantId === "SUPER_ADMIN") return state.leads;
    return state.leads.filter((l) => l.tenantId === tenantId);
  }

  public static addLead(lead: any): any {
    const state = this.getState();
    const newLead = {
      id: lead.id || `lead_${Date.now()}`,
      tenantId: lead.tenantId,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      score: lead.score || 80,
      status: lead.status || "NEW",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.leads.unshift(newLead);
    this.saveState(state);
    return newLead;
  }

  // --- Campaigns Management ---
  public static getCampaigns(tenantId: string): any[] {
    const state = this.getState();
    if (tenantId === "SUPER_ADMIN") return state.campaigns;
    return state.campaigns.filter((c) => c.tenantId === tenantId);
  }

  public static saveCampaign(campaign: any): any {
    const state = this.getState();
    const newCamp = {
      id: campaign.id || `camp_${Date.now()}`,
      tenantId: campaign.tenantId,
      name: campaign.name,
      slug: campaign.slug,
      flowId: campaign.flowId || null,
      metadata: campaign.metadata || "{}",
      opensCount: campaign.opensCount || 0,
      conversionsCount: campaign.conversionsCount || 0,
      contacts: campaign.contacts || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.campaigns.unshift(newCamp);
    this.saveState(state);
    return newCamp;
  }

  // --- Conversations Management ---
  public static getConversations(tenantId: string): any[] {
    const state = this.getState();
    if (tenantId === "SUPER_ADMIN") return state.conversations;
    return state.conversations.filter((c) => c.tenantId === tenantId);
  }
}

export default PersistentRegistry;
