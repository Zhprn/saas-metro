-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT,
    "telephone" TEXT,
    "picture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "emailVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emailverification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emailverification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokenblacklist" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokenblacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsappsession" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "ownerId" TEXT,
    "statePath" TEXT NOT NULL,
    "meJid" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsappsession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsappcontact" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "waJid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsappcontact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wacampaign" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT,
    "imageUrl" TEXT,
    "delayMs" INTEGER NOT NULL DEFAULT 1000,
    "jitterMs" INTEGER NOT NULL DEFAULT 500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wacampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsappmessage" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "phone" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "campaignId" TEXT,
    "direction" TEXT NOT NULL,
    "text" TEXT,
    "mediaUrl" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsappmessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmailaccount" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "expiryDate" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmailaccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emailcontact" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emailcontact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emailcampaign" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "delayMs" INTEGER NOT NULL DEFAULT 1000,
    "jitterMs" INTEGER NOT NULL DEFAULT 400,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emailcampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emailmessage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emailmessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientlogo" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientlogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "duration" INTEGER NOT NULL DEFAULT 30,
    "maxContacts" INTEGER NOT NULL DEFAULT 100,
    "maxWaBroadcast" INTEGER NOT NULL DEFAULT 500,
    "maxEmailBroadcast" INTEGER NOT NULL DEFAULT 1000,
    "maxWaSessions" INTEGER NOT NULL DEFAULT 1,
    "maxGmailAccounts" INTEGER NOT NULL DEFAULT 1,
    "features" TEXT,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "urutan_ke" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentType" TEXT,
    "transactionId" TEXT,
    "snapToken" TEXT,
    "snapUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmailmessage" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT,
    "subject" TEXT,
    "snippet" TEXT,
    "internalDate" TIMESTAMP(3),
    "labels" JSONB NOT NULL,
    "raw" JSONB NOT NULL,
    "gmailAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmailmessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "emailverification_userId_tokenHash_idx" ON "emailverification"("userId", "tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "account_provider_providerAccountId_key" ON "account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "tokenblacklist_token_key" ON "tokenblacklist"("token");

-- CreateIndex
CREATE UNIQUE INDEX "whatsappcontact_ownerId_phone_key" ON "whatsappcontact"("ownerId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "gmailaccount_email_key" ON "gmailaccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "emailcontact_ownerId_email_key" ON "emailcontact"("ownerId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "package_name_key" ON "package"("name");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orderId_key" ON "payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "gmailmessage_gmailMessageId_key" ON "gmailmessage"("gmailMessageId");

-- CreateIndex
CREATE INDEX "gmailmessage_gmailAccountId_internalDate_idx" ON "gmailmessage"("gmailAccountId", "internalDate");

-- AddForeignKey
ALTER TABLE "emailverification" ADD CONSTRAINT "emailverification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokenblacklist" ADD CONSTRAINT "tokenblacklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsappcontact" ADD CONSTRAINT "whatsappcontact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsappmessage" ADD CONSTRAINT "whatsappmessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "wacampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailcontact" ADD CONSTRAINT "emailcontact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailmessage" ADD CONSTRAINT "emailmessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "emailcampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmailmessage" ADD CONSTRAINT "gmailmessage_gmailAccountId_fkey" FOREIGN KEY ("gmailAccountId") REFERENCES "gmailaccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
