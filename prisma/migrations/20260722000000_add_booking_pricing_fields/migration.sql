-- D11: full price breakdown fields on bookings (driver fee, dropoff penalty, tax, deposit)
ALTER TABLE `bookings`
  ADD COLUMN `driver_fee` DOUBLE NOT NULL DEFAULT 0 AFTER `subtotal`,
  ADD COLUMN `dropoff_penalty` DOUBLE NOT NULL DEFAULT 0 AFTER `insurance_fee`,
  ADD COLUMN `tax_amount` DOUBLE NOT NULL DEFAULT 0 AFTER `dropoff_penalty`,
  ADD COLUMN `deposit_amount` DOUBLE NOT NULL DEFAULT 0 AFTER `tax_amount`;
