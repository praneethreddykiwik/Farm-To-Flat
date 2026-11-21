-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Unit" AS ENUM ('KG', 'BUNCH', 'PIECE', 'DOZEN', 'PACK');

-- CreateEnum
CREATE TYPE "public"."Diet" AS ENUM ('VEG', 'NONVEG');

-- CreateEnum
CREATE TYPE "public"."Availability" AS ENUM ('AVAILABLE', 'SOLD_OUT', 'HIDDEN');

-- CreateEnum
CREATE TYPE "public"."CouponType" AS ENUM ('PERCENT', 'FLAT', 'FREE_ITEM');

-- CreateEnum
CREATE TYPE "public"."StaffRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'PROCUREMENT', 'FULFILMENT');

-- CreateEnum
CREATE TYPE "public"."ProcurementStatus" AS ENUM ('AUTO_APPROVED', 'NEEDS_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "public"."Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tint" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unit" "public"."Unit" NOT NULL,
    "increment" DECIMAL(10,3) NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "costPaise" INTEGER NOT NULL DEFAULT 0,
    "dailyCap" INTEGER NOT NULL DEFAULT 100,
    "bufferPct" INTEGER NOT NULL DEFAULT 10,
    "farm" TEXT,
    "image" TEXT,
    "blurhash" TEXT,
    "variableWeight" BOOLEAN NOT NULL DEFAULT false,
    "diet" "public"."Diet" NOT NULL DEFAULT 'VEG',
    "isSeasonal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availability" "public"."Availability" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductKnowledge" (
    "productId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductKnowledge_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "public"."CommunityGeo" (
    "communityId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL DEFAULT 600,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityGeo_pkey" PRIMARY KEY ("communityId")
);

-- CreateTable
CREATE TABLE "public"."DemandArea" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "pincode" TEXT,
    "locality" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "checks" INTEGER NOT NULL DEFAULT 0,
    "checksByDay" JSONB NOT NULL DEFAULT '{}',
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandArea_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."DemandSubscription" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT,
    "mobile" TEXT,
    "areaKey" TEXT NOT NULL,
    "areaLabel" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "pincode" TEXT,
    "locality" TEXT,
    "city" TEXT,
    "communityName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'location',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "DemandSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Community" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "blocks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deliveryDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "windows" JSONB NOT NULL DEFAULT '[]',
    "morningCutoff" TEXT NOT NULL DEFAULT '03:45',
    "eveningCutoff" TEXT NOT NULL DEFAULT '15:00',
    "cutoffWarningMinutes" INTEGER NOT NULL DEFAULT 15,
    "orderLeadDays" INTEGER NOT NULL DEFAULT 1,
    "cutoffHours" INTEGER NOT NULL DEFAULT 10,
    "windowCapacity" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Coupon" (
    "code" TEXT NOT NULL,
    "label" TEXT,
    "type" "public"."CouponType" NOT NULL,
    "valueBp" INTEGER,
    "valuePaise" INTEGER,
    "freeProductId" TEXT,
    "minOrderPaise" INTEGER NOT NULL DEFAULT 0,
    "batchId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "globalCap" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "public"."CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponCode" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "walletBalancePaise" INTEGER NOT NULL DEFAULT 0,
    "walletLedger" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "refreshToken" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("refreshToken")
);

-- CreateTable
CREATE TABLE "public"."Device" (
    "expoPushToken" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("expoPushToken")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MealLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "mealName" TEXT,
    "status" TEXT NOT NULL,
    "plannedKcal" INTEGER,
    "actualKcal" INTEGER,
    "items" JSONB,
    "photoKey" TEXT,
    "note" TEXT,
    "confidence" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Address" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "block" TEXT NOT NULL,
    "flat" TEXT NOT NULL,
    "floor" TEXT,
    "landmark" TEXT,
    "recipientName" TEXT,
    "contactNumber" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "customerId" TEXT,
    "customerName" TEXT,
    "mobile" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "address" JSONB,
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "subtotalPaise" INTEGER NOT NULL,
    "costPaise" INTEGER NOT NULL DEFAULT 0,
    "couponCode" TEXT,
    "couponDiscountPaise" INTEGER NOT NULL DEFAULT 0,
    "deliveryChargePaise" INTEGER NOT NULL DEFAULT 0,
    "chargeBreakdown" JSONB,
    "taxPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "walletAppliedPaise" INTEGER NOT NULL DEFAULT 0,
    "gatewayAmountPaise" INTEGER NOT NULL DEFAULT 0,
    "deliveryDate" TEXT,
    "window" TEXT,
    "deliveryNote" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'PREPAID',
    "codCollectedPaise" INTEGER NOT NULL DEFAULT 0,
    "codCollectedAt" TEXT,
    "deliveryOtp" TEXT,
    "deliveryOtpIssuedAt" TEXT,
    "deliveredAt" TEXT,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "cancelRequestedAt" TEXT,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "purpose" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "refundedPaise" INTEGER NOT NULL DEFAULT 0,
    "refundId" TEXT,
    "refundFailed" BOOLEAN NOT NULL DEFAULT false,
    "refundFailedAt" TIMESTAMP(3),
    "orphan" BOOLEAN NOT NULL DEFAULT false,
    "capturedVia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Staff" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "name" TEXT,
    "role" "public"."StaffRole" NOT NULL,
    "aiAccess" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProcurementRecord" (
    "dateKey" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "estCostPaise" INTEGER NOT NULL,
    "actualCostPaise" INTEGER NOT NULL,
    "variancePct" DOUBLE PRECISION,
    "status" "public"."ProcurementStatus" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ProcurementRecord_pkey" PRIMARY KEY ("dateKey","productId")
);

-- CreateTable
CREATE TABLE "public"."Cart" (
    "customerId" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "couponCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("customerId")
);

-- CreateTable
CREATE TABLE "public"."AppConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "minOrderValuePaise" INTEGER NOT NULL DEFAULT 50000,
    "deliveryChargePaise" INTEGER NOT NULL DEFAULT 0,
    "procurementCostBufferPct" INTEGER NOT NULL DEFAULT 2,
    "procurementAutoApprove" BOOLEAN NOT NULL DEFAULT true,
    "supportEmail" TEXT DEFAULT 'support@farmtoflat.in',
    "supportPhone" TEXT DEFAULT '',
    "supportShowEmail" BOOLEAN NOT NULL DEFAULT true,
    "supportShowPhone" BOOLEAN NOT NULL DEFAULT false,
    "codEnabled" BOOLEAN NOT NULL DEFAULT false,
    "codMaxOrderPaise" INTEGER NOT NULL DEFAULT 300000,
    "deliveryOtpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "charges" JSONB NOT NULL DEFAULT '[]',
    "tax" JSONB,
    "adminEmails" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminAction" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WalletLedger" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "balanceAfterPaise" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OpsRecord" (
    "kind" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsRecord_pkey" PRIMARY KEY ("kind","id")
);

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "public"."Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_diet_idx" ON "public"."Product"("diet");

-- CreateIndex
CREATE INDEX "Product_isSeasonal_idx" ON "public"."Product"("isSeasonal");

-- CreateIndex
CREATE INDEX "DemandSubscription_areaKey_idx" ON "public"."DemandSubscription"("areaKey");

-- CreateIndex
CREATE UNIQUE INDEX "DemandSubscription_customerId_areaKey_key" ON "public"."DemandSubscription"("customerId", "areaKey");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponCode_customerId_key" ON "public"."CouponRedemption"("couponCode", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_mobile_key" ON "public"."Customer"("mobile");

-- CreateIndex
CREATE INDEX "Session_customerId_idx" ON "public"."Session"("customerId");

-- CreateIndex
CREATE INDEX "Device_customerId_idx" ON "public"."Device"("customerId");

-- CreateIndex
CREATE INDEX "Notification_customerId_idx" ON "public"."Notification"("customerId");

-- CreateIndex
CREATE INDEX "MealLog_customerId_date_idx" ON "public"."MealLog"("customerId", "date");

-- CreateIndex
CREATE INDEX "Address_customerId_idx" ON "public"."Address"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "public"."Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "public"."Order"("status");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "public"."Order"("customerId");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "public"."Payment"("customerId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "public"."Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "public"."Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_razorpayPaymentId_idx" ON "public"."Payment"("razorpayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_mobile_key" ON "public"."Staff"("mobile");

-- CreateIndex
CREATE INDEX "AdminAction_at_idx" ON "public"."AdminAction"("at");

-- CreateIndex
CREATE INDEX "AdminAction_target_idx" ON "public"."AdminAction"("target");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedger_idempotencyKey_key" ON "public"."WalletLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletLedger_customerId_createdAt_idx" ON "public"."WalletLedger"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletLedger_reference_idx" ON "public"."WalletLedger"("reference");

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponCode_fkey" FOREIGN KEY ("couponCode") REFERENCES "public"."Coupon"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CouponRedemption" ADD CONSTRAINT "CouponRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Address" ADD CONSTRAINT "Address_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WalletLedger" ADD CONSTRAINT "WalletLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

