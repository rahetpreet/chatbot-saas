-- CreateIndex
CREATE INDEX "CampaignContact_campaignId_createdAt_idx" ON "CampaignContact"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignContact_tenantId_createdAt_idx" ON "CampaignContact"("tenantId", "createdAt");

