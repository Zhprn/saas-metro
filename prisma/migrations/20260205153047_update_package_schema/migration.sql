/*
  Warnings:

  - You are about to drop the column `duration` on the `package` table. All the data in the column will be lost.
  - You are about to drop the column `isPopular` on the `package` table. All the data in the column will be lost.
  - You are about to drop the column `maxContacts` on the `package` table. All the data in the column will be lost.
  - You are about to drop the column `maxEmailBroadcast` on the `package` table. All the data in the column will be lost.
  - You are about to drop the column `maxGmailAccounts` on the `package` table. All the data in the column will be lost.
  - You are about to drop the column `maxWaBroadcast` on the `package` table. All the data in the column will be lost.
  - You are about to drop the column `maxWaSessions` on the `package` table. All the data in the column will be lost.
  - You are about to drop the column `urutan_ke` on the `package` table. All the data in the column will be lost.
  - Made the column `description` on table `package` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "package" DROP COLUMN "duration",
DROP COLUMN "isPopular",
DROP COLUMN "maxContacts",
DROP COLUMN "maxEmailBroadcast",
DROP COLUMN "maxGmailAccounts",
DROP COLUMN "maxWaBroadcast",
DROP COLUMN "maxWaSessions",
DROP COLUMN "urutan_ke",
ADD COLUMN     "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
ALTER COLUMN "description" SET NOT NULL;
