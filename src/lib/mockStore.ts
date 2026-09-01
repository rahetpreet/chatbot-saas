// Resilient In-Memory & Fallback State Store
// Keeps the entire SaaS platform fully operational (Login, Flows, AI generator, Campaigns, Leads, Conversations, Widget)
// even if cloud database connection is down or credentials fail.

export interface MockTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  planTier: string;
  maxMessagesPerMonth: number;
  maxFlows: number;
  maxCampaignLinks: number;
  maxStorageMb: number;
  widgetSettings?: string;
  aiConfig?: string;
  customSmtpConfig?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    flows: number;
    conversations: number;
    leads: number;
    campaigns: number;
    users: number;
  };
  users?: any[];
}

export interface MockUser {
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  role: string;
  status: string;
  passwordHash?: string;
  tenant?: any;
}

export interface MockFlow {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  version: number;
  status: string;
  isDefault: boolean;
  nodes: string;
  edges: string;
  publishedNodes?: string | null;
  publishedEdges?: string | null;
  triggers?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    conversations: number;
    analyticsEvents: number;
  };
}

export interface MockCampaign {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  flowId?: string | null;
  metadata?: string | null;
  opensCount: number;
  conversionsCount: number;
  createdAt: string;
  updatedAt: string;
  contacts?: any[];
  _count?: {
    contacts: number;
  };
}

export interface MockConversation {
  id: string;
  tenantId: string;
  flowId?: string | null;
  campaignContactId?: string | null;
  visitorId: string;
  sessionStatus: string;
  visitorInfo?: string | null;
  collectedData?: string | null;
  currentNodeId?: string | null;
  startedAt: string;
  lastActiveAt: string;
  closedAt?: string | null;
  messages?: any[];
  campaignContact?: any;
}

export interface MockLead {
  id: string;
  tenantId: string;
  conversationId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  contactInfo?: string | null;
  collectedFields?: string | null;
  score: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Default initial demo starter flow
const DEFAULT_STARTER_NODES = [
  {
    id: "node-start",
    type: "start",
    position: { x: 280, y: 40 },
    data: { label: "Trigger: Widget Open", nodeType: "start" },
  },
  {
    id: "node-greeting",
    type: "message",
    position: { x: 280, y: 160 },
    data: {
      label: "Greeting Message",
      nodeType: "message",
      messageText: "Hello! Welcome to our website. How can we assist you today?",
    },
  },
  {
    id: "node-options",
    type: "buttons",
    position: { x: 280, y: 300 },
    data: {
      label: "Main Menu",
      nodeType: "buttons",
      inputKey: "service_interest",
      options: [
        { id: "opt-1", label: "💬 Speak to Sales / Booking", value: "sales" },
        { id: "opt-2", label: "❓ Ask a Question", value: "inquiries" },
        { id: "opt-3", label: "📦 Track an Order", value: "support" },
      ],
    },
  },
  {
    id: "node-sales-msg",
    type: "message",
    position: { x: 100, y: 460 },
    data: {
      label: "Sales Prompt",
      nodeType: "message",
      messageText: "Great! Let me take down your contact info and our team will get in touch immediately.",
    },
  },
  {
    id: "node-capture-name",
    type: "input",
    position: { x: 100, y: 580 },
    data: {
      label: "Capture Name",
      nodeType: "input",
      inputKey: "name",
      placeholder: "Enter your full name...",
      validationType: "text",
    },
  },
  {
    id: "node-capture-email",
    type: "input",
    position: { x: 100, y: 700 },
    data: {
      label: "Capture Email",
      nodeType: "input",
      inputKey: "email",
      placeholder: "Enter your email address...",
      validationType: "email",
    },
  },
  {
    id: "node-thank-you",
    type: "message",
    position: { x: 100, y: 840 },
    data: {
      label: "Thank You Message",
      nodeType: "message",
      messageText: "Thank you! We have received your details and will contact you shortly.",
    },
  },
];

const DEFAULT_STARTER_EDGES = [
  { id: "e-start-greet", source: "node-start", target: "node-greeting" },
  { id: "e-greet-opt", source: "node-greeting", target: "node-options" },
  { id: "e-opt-sales", source: "node-options", target: "node-sales-msg", sourceHandle: "opt-1" },
  { id: "e-sales-name", source: "node-sales-msg", target: "node-capture-name" },
  { id: "e-name-email", source: "node-capture-name", target: "node-capture-email" },
  { id: "e-email-thanks", source: "node-capture-email", target: "node-thank-you" },
];

class MockStore {
  public tenants: MockTenant[] = [
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
      widgetSettings: JSON.stringify({
        primaryColor: "#4f46e5",
        secondaryColor: "#6366f1",
        textColor: "#ffffff",
        botName: "Acme Assistant",
        botSubtitle: "Typically replies instantly",
        avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=acme",
        launcherStyle: "bubble",
        launcherIcon: "sparkles",
        launcherPosition: "bottom-right",
        greetingBadge: "👋 Have questions? Chat with us!",
        showGreetingBadge: true,
        soundEnabled: true,
        allowedDomains: [],
      }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _count: { flows: 2, conversations: 5, leads: 3, campaigns: 1, users: 1 },
      users: [
        {
          id: "u_client_default",
          email: "client@acme.com",
          name: "Acme Admin",
          role: "CLIENT_ADMIN",
          status: "ACTIVE",
        },
      ],
    },
  ];

  public users: MockUser[] = [
    {
      id: "u_admin_default",
      tenantId: null,
      email: "admin@platform.local",
      name: "System Super Admin",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
    {
      id: "u_client_default",
      tenantId: "t_acme_corp",
      email: "client@acme.com",
      name: "Acme Admin",
      role: "CLIENT_ADMIN",
      status: "ACTIVE",
      tenant: {
        id: "t_acme_corp",
        name: "Acme Corp",
        slug: "acme-corp",
        status: "ACTIVE",
      },
    },
  ];

  public flows: MockFlow[] = [
    {
      id: "flow_starter_default",
      tenantId: "t_acme_corp",
      name: "Lead Generation & Appointment Flow",
      description: "Default automated greeting, lead qualifier, and consultation booking flow",
      version: 1,
      status: "PUBLISHED",
      isDefault: true,
      nodes: JSON.stringify(DEFAULT_STARTER_NODES),
      edges: JSON.stringify(DEFAULT_STARTER_EDGES),
      publishedNodes: JSON.stringify(DEFAULT_STARTER_NODES),
      publishedEdges: JSON.stringify(DEFAULT_STARTER_EDGES),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _count: { conversations: 5, analyticsEvents: 18 },
    },
    {
      id: "flow_support_triage",
      tenantId: "t_acme_corp",
      name: "24/7 Support & FAQ Triage",
      description: "Handles frequent inquiries, documentation lookups, and human agent handover",
      version: 1,
      status: "PUBLISHED",
      isDefault: false,
      nodes: JSON.stringify(DEFAULT_STARTER_NODES),
      edges: JSON.stringify(DEFAULT_STARTER_EDGES),
      publishedNodes: JSON.stringify(DEFAULT_STARTER_NODES),
      publishedEdges: JSON.stringify(DEFAULT_STARTER_EDGES),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _count: { conversations: 2, analyticsEvents: 8 },
    },
  ];

  public campaigns: MockCampaign[] = [
    {
      id: "cmp_demo_1",
      tenantId: "t_acme_corp",
      name: "Summer Promo Outreach",
      slug: "summer-outreach",
      flowId: "flow_starter_default",
      opensCount: 14,
      conversionsCount: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      contacts: [
        {
          id: "cnt_1",
          campaignId: "cmp_demo_1",
          tenantId: "t_acme_corp",
          contactIdentifier: "lead-alex",
          name: "Alex Smith",
          email: "alex@example.com",
          phone: "+1 555-0199",
          customUrlSlug: "alex-sm-49f",
          opensCount: 2,
          status: "OPENED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "cnt_2",
          campaignId: "cmp_demo_1",
          tenantId: "t_acme_corp",
          contactIdentifier: "lead-priya",
          name: "Priya Sharma",
          email: "priya@example.com",
          phone: "+91 9876543210",
          customUrlSlug: "priya-sh-82a",
          opensCount: 1,
          status: "OPENED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      _count: { contacts: 2 },
    },
  ];

  public conversations: MockConversation[] = [
    {
      id: "conv_demo_1",
      tenantId: "t_acme_corp",
      flowId: "flow_starter_default",
      visitorId: "vis_visitor_881249",
      sessionStatus: "RESOLVED",
      visitorInfo: JSON.stringify({ browser: "Chrome", os: "Windows", country: "IN" }),
      collectedData: JSON.stringify({ name: "Alex Smith", email: "alex@example.com", interest: "sales" }),
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      lastActiveAt: new Date(Date.now() - 1800000).toISOString(),
      messages: [
        {
          id: "m1",
          conversationId: "conv_demo_1",
          senderType: "BOT",
          content: "Hello! Welcome to our website. How can we assist you today?",
          timestamp: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: "m2",
          conversationId: "conv_demo_1",
          senderType: "VISITOR",
          content: "I want to speak with sales about your Pro plan",
          timestamp: new Date(Date.now() - 3500000).toISOString(),
        },
        {
          id: "m3",
          conversationId: "conv_demo_1",
          senderType: "BOT",
          content: "Great! Let me take down your contact info and our team will get in touch immediately.",
          timestamp: new Date(Date.now() - 3400000).toISOString(),
        },
        {
          id: "m4",
          conversationId: "conv_demo_1",
          senderType: "VISITOR",
          content: "Alex Smith - alex@example.com",
          timestamp: new Date(Date.now() - 3300000).toISOString(),
        },
      ],
    },
  ];

  public leads: MockLead[] = [
    {
      id: "lead_1",
      tenantId: "t_acme_corp",
      conversationId: "conv_demo_1",
      name: "Alex Smith",
      email: "alex@example.com",
      phone: "+1 555-0199",
      contactInfo: JSON.stringify({ interest: "Pro Plan Subscription" }),
      collectedFields: JSON.stringify({ budget: "$500/mo", timeline: "Immediate" }),
      score: 90,
      status: "QUALIFIED",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: "lead_2",
      tenantId: "t_acme_corp",
      conversationId: null,
      name: "Priya Sharma",
      email: "priya@example.com",
      phone: "+91 9876543210",
      contactInfo: JSON.stringify({ interest: "Custom AI Chatbot" }),
      collectedFields: JSON.stringify({ company: "Sharma Tech" }),
      score: 85,
      status: "NEW",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: "lead_3",
      tenantId: "t_acme_corp",
      conversationId: null,
      name: "David Miller",
      email: "david.m@corporate.io",
      phone: "+44 20 7946 0912",
      contactInfo: JSON.stringify({ interest: "Enterprise Deployment" }),
      collectedFields: JSON.stringify({ employees: "50-200" }),
      score: 95,
      status: "CONVERTED",
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  public auditLogs: any[] = [
    {
      id: "log_1",
      tenantId: "t_acme_corp",
      userId: "u_admin_default",
      action: "PLATFORM_INITIALIZED",
      ipAddress: "127.0.0.1",
      details: JSON.stringify({ status: "Online" }),
      timestamp: new Date().toISOString(),
    },
  ];

  // Helper methods
  public getTenant(idOrSlug: string): MockTenant | undefined {
    return this.tenants.find((t) => t.id === idOrSlug || t.slug === idOrSlug);
  }

  public getFlows(tenantId: string): MockFlow[] {
    return this.flows.filter((f) => f.tenantId === tenantId || tenantId === "SUPER_ADMIN");
  }

  public getFlow(id: string, tenantId?: string): MockFlow | undefined {
    return this.flows.find((f) => f.id === id && (!tenantId || tenantId === "SUPER_ADMIN" || f.tenantId === tenantId));
  }

  public addTenant(tenantData: Partial<MockTenant>, adminData?: Partial<MockUser>): MockTenant {
    const slug = tenantData.slug || tenantData.name?.toLowerCase().replace(/\s+/g, "-") || `tenant-${Date.now()}`;
    const newTenant: MockTenant = {
      id: `t_${slug}`,
      name: tenantData.name || "New Company",
      slug,
      status: tenantData.status || "ACTIVE",
      planTier: tenantData.planTier || "STARTER",
      maxMessagesPerMonth: tenantData.maxMessagesPerMonth || 5000,
      maxFlows: tenantData.maxFlows || 5,
      maxCampaignLinks: tenantData.maxCampaignLinks || 50,
      maxStorageMb: tenantData.maxStorageMb || 100,
      widgetSettings: tenantData.widgetSettings || JSON.stringify({
        primaryColor: "#4f46e5",
        secondaryColor: "#6366f1",
        textColor: "#ffffff",
        botName: `${tenantData.name} Assistant`,
        botSubtitle: "Typically replies instantly",
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${slug}`,
        launcherStyle: "bubble",
        launcherIcon: "sparkles",
        launcherPosition: "bottom-right",
        greetingBadge: "👋 Have questions? Chat with us!",
        showGreetingBadge: true,
        soundEnabled: true,
        allowedDomains: [],
      }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _count: { flows: 1, conversations: 0, leads: 0, campaigns: 0, users: 1 },
      users: adminData
        ? [
            {
              id: `u_${slug}_admin`,
              email: adminData.email,
              name: adminData.name,
              role: "CLIENT_ADMIN",
              status: "ACTIVE",
            },
          ]
        : [],
    };

    this.tenants.unshift(newTenant);

    if (adminData && adminData.email) {
      this.users.push({
        id: `u_${slug}_admin`,
        tenantId: newTenant.id,
        email: adminData.email.toLowerCase().trim(),
        name: adminData.name || `${newTenant.name} Admin`,
        role: "CLIENT_ADMIN",
        status: "ACTIVE",
        tenant: {
          id: newTenant.id,
          name: newTenant.name,
          slug: newTenant.slug,
          status: newTenant.status,
        },
      });
    }

    // Also create starter flow for the new tenant
    this.flows.push({
      id: `flow_${slug}_default`,
      tenantId: newTenant.id,
      name: "Welcome & Lead Capture Flow",
      description: "Starter lead qualification and greeting flow",
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
    });

    return newTenant;
  }
}

// Global singleton
declare global {
  // eslint-disable-next-line no-var
  var mockStore: MockStore | undefined;
}

export const mockStore = global.mockStore || new MockStore();

if (process.env.NODE_ENV !== "production") {
  global.mockStore = mockStore;
}

export default mockStore;
