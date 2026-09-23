-- AlterTable: Day 19 (UC-20) cancel + refund fields
ALTER TABLE `bookings`
  ADD COLUMN `cancelled_at` DATETIME(3) NULL,
  ADD COLUMN `refund_amount` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `refund_percent` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `refund_status` VARCHAR(191) NULL;
