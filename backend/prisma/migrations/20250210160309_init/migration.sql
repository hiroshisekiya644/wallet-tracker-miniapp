/*
  Warnings:

  - You are about to drop the column `balance` on the `Token` table. All the data in the column will be lost.
  - You are about to drop the column `metadataAddress` on the `Token` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `Token` table. All the data in the column will be lost.
  - Added the required column `amount` to the `Token` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creationTime` to the `Token` table without a default value. This is not possible if the table is not empty.
  - Added the required column `postBalance` to the `Token` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Token" DROP COLUMN "balance",
DROP COLUMN "metadataAddress",
DROP COLUMN "timestamp",
ADD COLUMN     "amount" INTEGER NOT NULL,
ADD COLUMN     "creationTime" TEXT NOT NULL,
ADD COLUMN     "postBalance" INTEGER NOT NULL;
