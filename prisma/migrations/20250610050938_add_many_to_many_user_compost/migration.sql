/*
  Warnings:

  - You are about to drop the column `maintenanceAgentId` on the `Compost` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Compost" DROP CONSTRAINT "Compost_maintenanceAgentId_fkey";

-- AlterTable
ALTER TABLE "Compost" DROP COLUMN "maintenanceAgentId";

-- CreateTable
CREATE TABLE "_UserComposts" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_UserComposts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_UserComposts_B_index" ON "_UserComposts"("B");

-- AddForeignKey
ALTER TABLE "_UserComposts" ADD CONSTRAINT "_UserComposts_A_fkey" FOREIGN KEY ("A") REFERENCES "Compost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserComposts" ADD CONSTRAINT "_UserComposts_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
