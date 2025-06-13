/*
  Warnings:

  - You are about to drop the column `installationDate` on the `Compost` table. All the data in the column will be lost.
  - You are about to drop the column `latitude` on the `Compost` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `Compost` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Compost" DROP COLUMN "installationDate",
DROP COLUMN "latitude",
DROP COLUMN "longitude";
