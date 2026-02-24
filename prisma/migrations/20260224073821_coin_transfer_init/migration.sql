/*
  Warnings:

  - Changed the type of `reason` on the `CoinEvent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "CoinReason" AS ENUM ('LESSON_COMPLETION', 'TRANSFER_IN', 'TRANSFER_OUT');

-- AlterTable
ALTER TABLE "CoinEvent" DROP COLUMN "reason",
ADD COLUMN     "reason" "CoinReason" NOT NULL;

-- CreateIndex
CREATE INDEX "CoinEvent_userId_idx" ON "CoinEvent"("userId");
