export type UserRole = "SUPER_ADMIN" | "CLIENT_OWNER" | "CLIENT_ADMIN" | "CLIENT_AGENT" | "CLIENT_VIEWER";

export type TenantStatus = "TRIAL" | "ACTIVE" | "PAUSED" | "EXPIRED" | "CANCELLED";

export type FlowStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type NodeType =
  | "start"
  | "message"
  | "buttons"
  | "input"
  | "attachment"
  | "condition"
  | "webhook"
  | "ai_fallback"
  | "handover"
  | "close";

export interface FlowNodeData {
  label: string;
  nodeType: NodeType;
  // Message Node
  messageText?: string;
  mediaType?: "image" | "video" | "pdf" | "none";
  mediaUrl?: string;
  // Button / Quick-Reply Node
  options?: Array<{
    id: string;
    label: string;
    value: string;
    targetNodeId?: string;
  }>;
  // Input Form Node
  inputKey?: string; // Variable name to store (e.g., "name", "email", "phone", "customField")
  inputType?: "text" | "name" | "email" | "phone" | "number" | "date";
  inputPlaceholder?: string;
  validationRegex?: string;
  required?: boolean;
  // Attachment Node
  allowedTypes?: string[]; // ["image/*", "application/pdf", etc.]
  maxSizeMb?: number;
  uploadPrompt?: string;
  // Condition Node
  conditions?: Array<{
    id: string;
    variable: string;
    operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "is_set" | "is_not_set";
    value: string;
    targetNodeId?: string;
  }>;
  fallbackTargetNodeId?: string;
  // Webhook Node
  webhookUrl?: string;
  webhookMethod?: "GET" | "POST" | "PUT";
  webhookHeaders?: Record<string, string>;
  webhookBody?: string;
  responseMapping?: Record<string, string>; // e.g., { "crmId": "response.data.id" }
  // AI Fallback Node
  aiPrompt?: string;
  knowledgeBaseFilter?: string;
  confidenceThreshold?: number; // 0 to 1 (default 0.6)
  fallbackAction?: "handover" | "message" | "form";
  fallbackMessage?: string;
  // Handover Node
  handoverMessage?: string;
  notifyEmails?: string[];
  // Close Node
  closingMessage?: string;
  triggerLeadNotification?: boolean;
  resolveSession?: boolean;
  [key: string]: any;
}

export interface WidgetSettings {
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  botName: string;
  botSubtitle: string;
  avatarUrl: string;
  launcherStyle: "bubble" | "tab" | "bar";
  launcherIcon: "chat" | "sparkles" | "message-square" | "headset";
  launcherPosition: "bottom-right" | "bottom-left";
  greetingBadge: string;
  showGreetingBadge: boolean;
  soundEnabled: boolean;
  allowedDomains: string[];
}

export interface CustomSmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  from: string;
}

export interface AIConfig {
  enabled: boolean;
  provider: "disabled" | "ollama" | "groq" | "gemini" | "openrouter";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt: string;
  temperature: number;
  confidenceThreshold: number;
}

export interface LeadCollectedData {
  [key: string]: any;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
  impersonatingFrom?: string; // Super Admin ID if impersonating
  sessionId?: string;
}
