-- Bring the deployed schema in line with prisma/schema.prisma. These tables
-- are tenant-owned and are removed automatically when their Tenant is deleted.
CREATE TABLE IF NOT EXISTS "Attachment" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "conversationId" TEXT,
  "messageId" TEXT,
  "contactId" TEXT,
  "storageKey" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Webhook" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "event" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL UNIQUE,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "UsageRecord" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "metric" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "period" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("tenantId", "metric", "period")
);

CREATE TABLE IF NOT EXISTS "ExportJob" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "downloadUrl" TEXT,
  "filters" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "Attachment_tenantId_idx" ON "Attachment"("tenantId");
CREATE INDEX IF NOT EXISTS "Attachment_storageKey_idx" ON "Attachment"("storageKey");
CREATE INDEX IF NOT EXISTS "Webhook_tenantId_idx" ON "Webhook"("tenantId");
CREATE INDEX IF NOT EXISTS "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");
CREATE INDEX IF NOT EXISTS "UsageRecord_tenantId_idx" ON "UsageRecord"("tenantId");
CREATE INDEX IF NOT EXISTS "ExportJob_tenantId_idx" ON "ExportJob"("tenantId");

-- These indexes were added to the Prisma schema after the original database
-- was created. IF NOT EXISTS makes the migration safe for already-updated
-- installations while keeping fresh deployments in sync with the schema.
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_tenantId_eventType_idx" ON "AnalyticsEvent"("tenantId", "eventType");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_tenantId_timestamp_idx" ON "AnalyticsEvent"("tenantId", "timestamp");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_conversationId_idx" ON "AnalyticsEvent"("conversationId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_flowId_idx" ON "AnalyticsEvent"("flowId");
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_timestamp_idx" ON "AuditLog"("tenantId", "timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "Contact_tenantId_deletedAt_idx" ON "Contact"("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Contact_tenantId_createdAt_idx" ON "Contact"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "Conversation_tenantId_sessionStatus_idx" ON "Conversation"("tenantId", "sessionStatus");
CREATE INDEX IF NOT EXISTS "Conversation_tenantId_lastActiveAt_idx" ON "Conversation"("tenantId", "lastActiveAt");
CREATE INDEX IF NOT EXISTS "Conversation_tenantId_startedAt_idx" ON "Conversation"("tenantId", "startedAt");
CREATE INDEX IF NOT EXISTS "Conversation_publicSessionTokenHash_idx" ON "Conversation"("publicSessionTokenHash");
CREATE INDEX IF NOT EXISTS "Flow_tenantId_status_idx" ON "Flow"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Flow_tenantId_deletedAt_idx" ON "Flow"("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Flow_tenantId_updatedAt_idx" ON "Flow"("tenantId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Lead_tenantId_status_idx" ON "Lead"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Lead_tenantId_deletedAt_idx" ON "Lead"("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Lead_tenantId_createdAt_idx" ON "Lead"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "Lead_conversationId_idx" ON "Lead"("conversationId");
CREATE INDEX IF NOT EXISTS "Message_conversationId_timestamp_idx" ON "Message"("conversationId", "timestamp");
CREATE INDEX IF NOT EXISTS "Message_senderType_idx" ON "Message"("senderType");
CREATE INDEX IF NOT EXISTS "Tenant_planTier_idx" ON "Tenant"("planTier");
CREATE INDEX IF NOT EXISTS "Tenant_createdAt_idx" ON "Tenant"("createdAt");
CREATE INDEX IF NOT EXISTS "User_tenantId_isActive_idx" ON "User"("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "User_tenantId_role_idx" ON "User"("tenantId", "role");
CREATE INDEX IF NOT EXISTS "User_lastLoginAt_idx" ON "User"("lastLoginAt");
