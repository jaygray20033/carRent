-- AlterTable: Day 30 — booking start/return handover fields
ALTER TABLE `bookings`
  ADD COLUMN `actual_pickup_at` DATETIME(3) NULL,
  ADD COLUMN `actual_return_at` DATETIME(3) NULL,
  ADD COLUMN `extra_fee` DOUBLE NOT NULL DEFAULT 0;
