-- CreateEnum
CREATE TYPE "KnowledgeFileType" AS ENUM ('COMPANY_PROFILE', 'PRICELIST', 'FAQ');

-- AlterTable
ALTER TABLE "aiembedding" ADD COLUMN     "fileId" TEXT,
ADD COLUMN     "fileType" "KnowledgeFileType" NOT NULL DEFAULT 'FAQ';

-- AlterTable
ALTER TABLE "aiknowledgefile" ADD COLUMN     "fileType" "KnowledgeFileType" NOT NULL DEFAULT 'FAQ';

-- CreateIndex
CREATE INDEX "aiembedding_agentId_fileType_idx" ON "aiembedding"("agentId", "fileType");
