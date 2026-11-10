/*
  Warnings:

  - The `labels` column on the `gmailmessage` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "gmailmessage" DROP COLUMN "labels",
ADD COLUMN     "labels" TEXT[];
