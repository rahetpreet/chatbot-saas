-- AlterTable
ALTER TABLE "KnowledgeDoc" ADD COLUMN     "chunkIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "sourceUrl" TEXT;

-- CreateIndex
CREATE INDEX "KnowledgeDoc_tenantId_sourceType_idx" ON "KnowledgeDoc"("tenantId", "sourceType");

-- CreateIndex
CREATE INDEX "KnowledgeDoc_sourceUrl_idx" ON "KnowledgeDoc"("sourceUrl");

