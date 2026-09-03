-- Indexes declared in schema.prisma that were never emitted by the initial migration.
-- IF NOT EXISTS keeps this a no-op on databases that were created with db push,
-- while guaranteeing a correct schema on any freshly migrated database.

CREATE INDEX IF NOT EXISTS "Tenant_slug_idx" ON "Tenant"("slug");
CREATE INDEX IF NOT EXISTS "Tenant_status_idx" ON "Tenant"("status");
CREATE INDEX IF NOT EXISTS "Tenant_deletedAt_idx" ON "Tenant"("deletedAt");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_isActive_idx" ON "User"("isActive");
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX IF NOT EXISTS "Session_tokenHash_idx" ON "Session"("tokenHash");
CREATE INDEX IF NOT EXISTS "TenantUser_userId_idx" ON "TenantUser"("userId");
CREATE INDEX IF NOT EXISTS "Subscription_tenantId_status_idx" ON "Subscription"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Contact_tenantId_email_idx" ON "Contact"("tenantId", "email");
CREATE INDEX IF NOT EXISTS "Contact_tenantId_phone_idx" ON "Contact"("tenantId", "phone");
CREATE INDEX IF NOT EXISTS "Chatbot_tenantId_status_idx" ON "Chatbot"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "ChatbotVersion_chatbotId_status_idx" ON "ChatbotVersion"("chatbotId", "status");
CREATE INDEX IF NOT EXISTS "Flow_status_idx" ON "Flow"("status");
CREATE INDEX IF NOT EXISTS "Flow_deletedAt_idx" ON "Flow"("deletedAt");
CREATE INDEX IF NOT EXISTS "Campaign_deletedAt_idx" ON "Campaign"("deletedAt");
CREATE INDEX IF NOT EXISTS "CampaignContact_tenantId_idx" ON "CampaignContact"("tenantId");
CREATE INDEX IF NOT EXISTS "CampaignContact_campaignId_idx" ON "CampaignContact"("campaignId");
CREATE INDEX IF NOT EXISTS "CampaignContact_customUrlSlug_idx" ON "CampaignContact"("customUrlSlug");
CREATE INDEX IF NOT EXISTS "CampaignContact_deletedAt_idx" ON "CampaignContact"("deletedAt");
CREATE INDEX IF NOT EXISTS "Conversation_sessionStatus_idx" ON "Conversation"("sessionStatus");
CREATE INDEX IF NOT EXISTS "Conversation_visitorId_idx" ON "Conversation"("visitorId");
CREATE INDEX IF NOT EXISTS "Message_timestamp_idx" ON "Message"("timestamp");
CREATE INDEX IF NOT EXISTS "Lead_status_idx" ON "Lead"("status");
CREATE INDEX IF NOT EXISTS "Lead_deletedAt_idx" ON "Lead"("deletedAt");
CREATE INDEX IF NOT EXISTS "KnowledgeDoc_tenantId_idx" ON "KnowledgeDoc"("tenantId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_tenantId_idx" ON "AnalyticsEvent"("tenantId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_eventType_idx" ON "AnalyticsEvent"("eventType");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_timestamp_idx" ON "AnalyticsEvent"("timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX IF NOT EXISTS "DevEmail_createdAt_idx" ON "DevEmail"("createdAt");
