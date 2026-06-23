-- ─────────────────────────────────────────────────────────────────────
-- Day 12: Insurance Plans + Coupon Validate (UC-15, UC-16)
-- New tables: insurance_plans, coupons, coupon_usages
-- Altered:   bookings (add insurance_plan_id, coupon_id, subtotal,
--            insurance_fee, coupon_discount)
-- ─────────────────────────────────────────────────────────────────────

-- ─── Insurance Plans ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "insurance_plans" (
    "id"           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code"         TEXT    NOT NULL,
    "name"         TEXT    NOT NULL,
    "description"  TEXT,
    "rate_percent" REAL    NOT NULL DEFAULT 0,
    "is_active"    BOOLEAN NOT NULL DEFAULT 1,
    "created_at"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "insurance_plans_code_key" ON "insurance_plans"("code");

-- ─── Coupons ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "coupons" (
    "id"                INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code"              TEXT     NOT NULL,
    "type"              TEXT     NOT NULL,          -- FIXED | PERCENT | FREE_DRIVER
    "value"             REAL     NOT NULL DEFAULT 0,
    "min_order"         REAL     NOT NULL DEFAULT 0,
    "max_discount"      REAL,
    "max_use"           INTEGER  NOT NULL DEFAULT 0, -- 0 = unlimited
    "max_use_per_user"  INTEGER  NOT NULL DEFAULT 1,
    "start_at"          DATETIME NOT NULL,
    "end_at"            DATETIME NOT NULL,
    "is_active"         BOOLEAN  NOT NULL DEFAULT 1,
    "created_at"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- ─── Coupon Usages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "coupon_usages" (
    "id"         INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
    "coupon_id"  INTEGER  NOT NULL,
    "user_id"    INTEGER  NOT NULL,
    "booking_id" INTEGER  NOT NULL,
    "discount"   REAL     NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupon_usages_coupon_id_fkey"
        FOREIGN KEY ("coupon_id") REFERENCES "coupons" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_coupon_usages_coupon_id" ON "coupon_usages"("coupon_id");
CREATE INDEX "idx_coupon_usages_user_id"   ON "coupon_usages"("user_id");

-- ─── Alter bookings — add new columns ──────────────────────────────
ALTER TABLE "bookings" ADD COLUMN "insurance_plan_id" INTEGER
    REFERENCES "insurance_plans"("id") ON DELETE SET NULL;

ALTER TABLE "bookings" ADD COLUMN "coupon_id" INTEGER
    REFERENCES "coupons"("id") ON DELETE SET NULL;

ALTER TABLE "bookings" ADD COLUMN "subtotal"        REAL NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "insurance_fee"   REAL NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "coupon_discount" REAL NOT NULL DEFAULT 0;

-- Index for insurance FK
CREATE INDEX "idx_bookings_insurance_plan_id" ON "bookings"("insurance_plan_id");
