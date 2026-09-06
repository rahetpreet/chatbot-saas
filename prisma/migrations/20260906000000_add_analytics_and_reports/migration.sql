-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "flowVersion" INTEGER,
ADD COLUMN     "leadId" TEXT,
ADD COLUMN     "nodeType" TEXT,
ADD COLUMN     "optionLabel" TEXT,
ADD COLUMN     "trackingLinkId" TEXT,
ADD COLUMN     "visitorId" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "flowVersion" INTEGER;

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "rangeStart" TIMESTAMP(3) NOT NULL,
    "rangeEnd" TIMESTAMP(3) NOT NULL,
    "filters" TEXT,
    "metrics" TEXT NOT NULL,
    "insights" TEXT,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyAnalytics" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'tenant',
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
    "chatbotOpens" INTEGER NOT NULL DEFAULT 0,
    "conversationsStarted" INTEGER NOT NULL DEFAULT 0,
    "conversationsComplete" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "formsStarted" INTEGER NOT NULL DEFAULT 0,
    "formsCompleted" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "linkOpens" INTEGER NOT NULL DEFAULT 0,
    "uniqueLinkOpens" INTEGER NOT NULL DEFAULT 0,
    "aiRequests" INTEGER NOT NULL DEFAULT 0,
    "handoffs" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportSnapshot_tenantId_idx" ON "ReportSnapshot"("tenantId");

-- CreateIndex
CREATE INDEX "ReportSnapshot_tenantId_generatedAt_idx" ON "ReportSnapshot"("tenantId", "generatedAt");

-- CreateIndex
CREATE INDEX "ReportSnapshot_tenantId_reportType_idx" ON "ReportSnapshot"("tenantId", "reportType");

-- CreateIndex
CREATE INDEX "DailyAnalytics_tenantId_day_idx" ON "DailyAnalytics"("tenantId", "day");

-- CreateIndex
CREATE INDEX "DailyAnalytics_tenantId_scope_day_idx" ON "DailyAnalytics"("tenantId", "scope", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAnalytics_tenantId_day_scope_key" ON "DailyAnalytics"("tenantId", "day", "scope");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_eventType_timestamp_idx" ON "AnalyticsEvent"("tenantId", "eventType", "timestamp");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_flowId_nodeId_idx" ON "AnalyticsEvent"("tenantId", "flowId", "nodeId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_campaignId_timestamp_idx" ON "AnalyticsEvent"("tenantId", "campaignId", "timestamp");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_trackingLinkId_idx" ON "AnalyticsEvent"("tenantId", "trackingLinkId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_visitorId_idx" ON "AnalyticsEvent"("tenantId", "visitorId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_leadId_idx" ON "AnalyticsEvent"("tenantId", "leadId");

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAnalytics" ADD CONSTRAINT "DailyAnalytics_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

