-- B2B — per-booking payment intent chosen by the corporate admin at confirm time.
-- PAY_NOW  → a single-booking settlement is created the moment OtoRent confirms.
-- ON_CREDIT → the booking waits to be gathered into a monthly settlement period.
-- NULL = legacy bookings confirmed before this feature existed.

-- AlterTable corporate_bookings
ALTER TABLE `corporate_bookings`
    ADD COLUMN `payment_mode` ENUM('PAY_NOW', 'ON_CREDIT') NULL;
