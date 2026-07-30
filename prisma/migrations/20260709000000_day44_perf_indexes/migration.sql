-- Day 44 — Performance indexes review (§10.7)
-- bookings: overlap/availability check filters by vehicle + pickup/return window,
-- and "my bookings" list filters by user + status.
CREATE INDEX `bookings_vehicle_id_pickup_at_return_at_idx`
  ON `bookings`(`vehicle_id`, `pickup_at`, `return_at`);
CREATE INDEX `bookings_user_id_status_idx`
  ON `bookings`(`user_id`, `status`);

-- payments: refund search / receipt / status polling look up by booking.
CREATE INDEX `payments_booking_id_idx`
  ON `payments`(`booking_id`);
