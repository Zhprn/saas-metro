/*
  Warnings:

  - You are about to drop the `AiAgent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AiConversationMemory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AiEmbedding` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AiKnowledgeFile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AiUsageLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WaSession` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AiAgent" DROP CONSTRAINT "AiAgent_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "AiAgent" DROP CONSTRAINT "AiAgent_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "AiConversationMemory" DROP CONSTRAINT "AiConversationMemory_agentId_fkey";

-- DropForeignKey
ALTER TABLE "AiEmbedding" DROP CONSTRAINT "AiEmbedding_agentId_fkey";

-- DropForeignKey
ALTER TABLE "AiKnowledgeFile" DROP CONSTRAINT "AiKnowledgeFile_agentId_fkey";

-- DropForeignKey
ALTER TABLE "AiUsageLog" DROP CONSTRAINT "AiUsageLog_agentId_fkey";

-- DropTable
DROP TABLE "AiAgent";

-- DropTable
DROP TABLE "AiConversationMemory";

-- DropTable
DROP TABLE "AiEmbedding";

-- DropTable
DROP TABLE "AiKnowledgeFile";

-- DropTable
DROP TABLE "AiUsageLog";

-- DropTable
DROP TABLE "WaSession";

-- CreateTable
CREATE TABLE "aiagent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "AiMode" NOT NULL DEFAULT 'BOT',
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 500,
    "systemPrompt" TEXT,
    "fallbackReply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aiagent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aiknowledgefile" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "status" "FileStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aiknowledgefile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aiembedding" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aiembedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aiconversationmemory" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aiconversationmemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aiusagelog" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aiusagelog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wasession" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wasession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aiagent_sessionId_key" ON "aiagent"("sessionId");

-- CreateIndex
CREATE INDEX "aiembedding_agentId_idx" ON "aiembedding"("agentId");

-- CreateIndex
CREATE INDEX "aiconversationmemory_agentId_jid_idx" ON "aiconversationmemory"("agentId", "jid");

-- CreateIndex
CREATE INDEX "aiusagelog_agentId_idx" ON "aiusagelog"("agentId");

-- AddForeignKey
ALTER TABLE "aiagent" ADD CONSTRAINT "aiagent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aiagent" ADD CONSTRAINT "aiagent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "whatsappsession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aiknowledgefile" ADD CONSTRAINT "aiknowledgefile_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "aiagent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aiembedding" ADD CONSTRAINT "aiembedding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "aiagent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aiconversationmemory" ADD CONSTRAINT "aiconversationmemory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "aiagent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aiusagelog" ADD CONSTRAINT "aiusagelog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "aiagent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
