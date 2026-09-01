import { z } from "zod";

// Common validation schemas
export const emailSchema = z.string().email("Invalid email address").max(320).trim().toLowerCase();
export const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(1024);
export const nameSchema = z.string().min(1, "Name is required").max(100).trim();
export const slugSchema = z.string().min(1, "Slug is required").max(50).regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens");
export const phoneSchema = z.string().max(20).optional();
export const urlSchema = z.string().url("Invalid URL").optional();

// Auth validation schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(1024),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters").max(1024),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters").max(1024),
}).refine((data: any) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(1024),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(1024),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters").max(1024),
}).refine((data: any) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// Tenant validation schemas
export const createTenantSchema = z.object({
  name: z.string().min(1, "Company name is required").max(100).trim(),
  slug: slugSchema.optional(),
  adminEmail: emailSchema,
  adminName: nameSchema.optional(),
  planTier: z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]).default("STARTER"),
  maxMessagesPerMonth: z.number().int().min(0).default(5000),
  maxFlows: z.number().int().min(0).default(5),
  maxCampaignLinks: z.number().int().min(0).default(50),
  maxStorageMb: z.number().int().min(0).default(100),
});

// Contact validation schemas
export const createContactSchema = z.object({
  name: z.string().max(100).trim().optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  company: z.string().max(100).trim().optional(),
  source: z.string().max(50).trim().default("manual"),
}).refine((data: any) => data.name || data.email || data.phone, {
  message: "At least one identifier (name, email, or phone) is required",
});

// Flow validation schemas
export const createFlowSchema = z.object({
  name: z.string().min(1, "Flow name is required").max(100).trim(),
  description: z.string().max(500).trim().optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
});

// Campaign validation schemas
export const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required").max(100).trim(),
  slug: slugSchema,
  flowId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Public API validation schemas
export const publicSessionSchema = z.object({
  tenantSlug: z.string().min(1, "Tenant slug is required").max(50),
  visitorId: z.string().min(1, "Visitor ID is required").max(128),
  flowId: z.string().optional(),
  campaignContactId: z.string().optional(),
  referrer: z.string().max(2048).optional(),
});

export const publicMessageSchema = z.object({
  conversationId: z.string(),
  sessionToken: z.string().min(16, "Invalid session token"),
  userInput: z.object({
    type: z.string().default("text"),
    value: z.string().max(5000),
  }),
});

export const publicLeadSchema = z.object({
  conversationId: z.string(),
  sessionToken: z.string().min(16, "Invalid session token"),
  name: z.string().max(100).trim().optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  customFields: z.record(z.any()).optional(),
}).refine((data: any) => data.name || data.email || data.phone, {
  message: "Contact information is required",
});

// Settings validation schemas
export const smtpConfigSchema = z.object({
  host: z.string().min(1, "SMTP host is required").max(255),
  port: z.number().int().min(1).max(65535).default(587),
  user: z.string().min(1, "SMTP user is required").max(255),
  pass: z.string().max(255),
  secure: z.boolean().default(false),
  from: z.string().email().max(255).optional(),
  testEmail: emailSchema.optional(),
});

export const aiConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(["disabled", "ollama", "groq", "openrouter", "gemini"]).default("disabled"),
  model: z.string().max(100).default("llama3.2"),
  baseUrl: z.string().url().max(255).default("http://localhost:11434"),
  apiKey: z.string().max(255).optional(),
  systemPrompt: z.string().max(2000).default("You are a helpful customer support assistant."),
  temperature: z.number().min(0).max(2).default(0.7),
  confidenceThreshold: z.number().min(0).max(1).default(0.6),
});

// Impersonation schema
export const impersonateSchema = z.object({
  tenantId: z.string(),
  action: z.enum(["start", "stop"]).default("start"),
});

// Helper function to validate request body
export async function validateRequest<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): Promise<{ success: true; data: z.infer<T> } | { success: false; error: string }> {
  try {
    const data = await schema.parseAsync(body);
    return { success: true, data };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      return { success: false, error: firstError.message };
    }
    return { success: false, error: "Validation failed" };
  }
}
