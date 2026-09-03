-- Campaign-level tracking links (/c/<slug>?campaign=X) previously produced
-- conversations with no attribution, because Conversation could only reference
-- a CampaignContact (per-contact links). Add a direct campaign reference so
-- campaign-level opens and conversions can be counted.

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;

CREATE INDEX IF NOT EXISTS "Conversation_campaignId_idx" ON "Conversation"("campaignId");

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
