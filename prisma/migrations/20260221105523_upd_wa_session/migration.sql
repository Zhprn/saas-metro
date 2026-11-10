/*
  Warnings:

  - You are about to drop the column `userId` on the `WaSession` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "WaSession_userId_idx";

-- AlterTable
ALTER TABLE "WaSession" DROP COLUMN "userId";
