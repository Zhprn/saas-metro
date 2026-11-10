/*
  Warnings:

  - You are about to drop the column `features` on the `package` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "package" DROP COLUMN "features";

-- CreateTable
CREATE TABLE "package_list" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PackageToPackageList" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PackageToPackageList_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "package_list_name_key" ON "package_list"("name");

-- CreateIndex
CREATE INDEX "_PackageToPackageList_B_index" ON "_PackageToPackageList"("B");

-- AddForeignKey
ALTER TABLE "_PackageToPackageList" ADD CONSTRAINT "_PackageToPackageList_A_fkey" FOREIGN KEY ("A") REFERENCES "package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PackageToPackageList" ADD CONSTRAINT "_PackageToPackageList_B_fkey" FOREIGN KEY ("B") REFERENCES "package_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;
