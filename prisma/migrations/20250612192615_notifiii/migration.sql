/*
  Warnings:

  - You are about to drop the column `capacity` on the `Compost` table. All the data in the column will be lost.
  - You are about to drop the column `compostType` on the `Compost` table. All the data in the column will be lost.
  - You are about to drop the column `sensors` on the `Compost` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Compost" DROP COLUMN "capacity",
DROP COLUMN "compostType",
DROP COLUMN "sensors";
