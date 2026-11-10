/*
  Warnings:

  - A unique constraint covering the columns `[messageId]` on the table `whatsappmessage` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "whatsappmessage" ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "rawJson" JSONB,
ADD COLUMN     "type" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "whatsappmessage_messageId_key" ON "whatsappmessage"("messageId");
