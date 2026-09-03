-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "trackingLinkId" TEXT;

-- AlterTable
ALTER TABLE "TrackingLink" ADD COLUMN     "campaignContactId" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_trackingLinkId_idx" ON "Conversation"("trackingLinkId");

-- CreateIndex
CREATE INDEX "TrackingLink_campaignContactId_idx" ON "TrackingLink"("campaignContactId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_trackingLinkId_fkey" FOREIGN KEY ("trackingLinkId") REFERENCES "TrackingLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

