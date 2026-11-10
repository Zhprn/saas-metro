-- CreateTable
CREATE TABLE "WaSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaSession_userId_idx" ON "WaSession"("userId");
