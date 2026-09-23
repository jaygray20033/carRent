-- Day 29 (UC-50) — Extend reviews: tie to a completed booking, add content/photos/status.
-- The reviews table is currently unseeded, so restructuring columns is safe.

-- Rename `comment` → `content`
ALTER TABLE `reviews` CHANGE COLUMN `comment` `content` TEXT NULL;

-- New columns
ALTER TABLE `reviews`
  ADD COLUMN `booking_id` INTEGER NULL,
  ADD COLUMN `photos` TEXT NULL,
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING';

-- One review per completed booking
CREATE UNIQUE INDEX `reviews_booking_id_key` ON `reviews`(`booking_id`);

-- Query indexes
CREATE INDEX `reviews_vehicle_id_status_idx` ON `reviews`(`vehicle_id`, `status`);
CREATE INDEX `reviews_user_id_idx` ON `reviews`(`user_id`);
