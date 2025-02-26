/*
  Warnings:

  - You are about to drop the column `rui` on the `Token` table. All the data in the column will be lost.
  - Added the required column `uri` to the `Token` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Token" DROP COLUMN "rui",
ADD COLUMN     "uri" TEXT NOT NULL;
