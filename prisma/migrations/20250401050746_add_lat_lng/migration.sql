/*
  Warnings:

  - You are about to drop the column `geoLocation` on the `Site` table. All the data in the column will be lost.
  - Added the required column `latitude` to the `Compost` table without a default value. This is not possible if the table is not empty.
  - Added the required column `longitude` to the `Compost` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `latitude` to the `Site` table without a default value. This is not possible if the table is not empty.
  - Added the required column `longitude` to the `Site` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_id_fkey";

-- AlterTable
ALTER TABLE "Compost" ADD COLUMN     "latitude" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "longitude" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Site" DROP COLUMN "geoLocation",
ADD COLUMN     "latitude" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "longitude" DOUBLE PRECISION NOT NULL;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
