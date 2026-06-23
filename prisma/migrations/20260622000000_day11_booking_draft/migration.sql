-- ─────────────────────────────────────────────────────────────────────
-- Day 11: Booking Draft + Pricing (UC-14, UC-17)
-- Adds: pickup_point, dropoff_point, hold_until, pricing_snapshot, booking_histories
-- ─────────────────────────────────────────────────────────────────────

-- Add new columns to bookings table
ALTER TABLE "bookings" ADD COLUMN "pickup_point" TEXT;
ALTER TABLE "bookings" ADD COLUMN "dropoff_point" TEXT;
ALTER TABLE "bookings" ADD COLUMN "hold_until" DATETIME;
ALTER TABLE "bookings" ADD COLUMN "pricing_snapshot" TEXT;

-- Update status default: DRAFT instead of PENDING_PAYMENT
-- SQLite doesn't support ALTER COLUMN so we keep original default; 
-- application code will set status=DRAFT explicitly

-- Create booking_histories table
CREATE TABLE IF NOT EXISTS "booking_histories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "booking_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_histories_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_booking_histories_booking_id" ON "booking_histories"("booking_id");
CREATE INDEX "idx_bookings_status" ON "bookings"("status");
CREATE INDEX "idx_bookings_vehicle_pickup" ON "bookings"("vehicle_id", "pickup_at", "return_at");
