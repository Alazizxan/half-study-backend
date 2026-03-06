-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'AWAITING_RECEIPT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "CoinPurchaseRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "amountUzs" INTEGER NOT NULL,
    "cardMasked" TEXT,
    "receiptFileKey" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinPurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoinPurchaseRequest_userId_idx" ON "CoinPurchaseRequest"("userId");

-- CreateIndex
CREATE INDEX "CoinPurchaseRequest_status_idx" ON "CoinPurchaseRequest"("status");

-- AddForeignKey
ALTER TABLE "CoinPurchaseRequest" ADD CONSTRAINT "CoinPurchaseRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
