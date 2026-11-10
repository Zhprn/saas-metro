-- CreateTable
CREATE TABLE "whatsappconversation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "name" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageId" TEXT,
    "lastMessageText" TEXT,
    "lastMessageType" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsappconversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsappconversation_sessionId_idx" ON "whatsappconversation"("sessionId");

-- CreateIndex
CREATE INDEX "whatsappconversation_lastMessageAt_idx" ON "whatsappconversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsappconversation_sessionId_jid_key" ON "whatsappconversation"("sessionId", "jid");
