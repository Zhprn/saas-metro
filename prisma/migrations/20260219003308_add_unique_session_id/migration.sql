/*
  Warnings:

  - A unique constraint covering the columns `[sessionId]` on the table `AiAgent` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AiAgent_sessionId_key" ON "AiAgent"("sessionId");
