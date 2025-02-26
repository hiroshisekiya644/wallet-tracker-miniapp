-- CreateTable
CREATE TABLE "Token" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "Decimals" INTEGER NOT NULL,
    "mintAddress" TEXT NOT NULL,
    "metadataAddress" TEXT NOT NULL,
    "rui" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "balance" INTEGER NOT NULL,
    "creator" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Token_id_key" ON "Token"("id");
