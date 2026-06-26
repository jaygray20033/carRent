/**
 * Test script: Simulate release-hold worker behavior
 * Tests the auto-cancel logic for expired DRAFT/PENDING_PAYMENT bookings
 *
 * Run: node src/tests/test-release-hold.js
 */
require('dotenv').config();

const { sequelize, Booking, BookingHistory, Car, User, Coupon, CouponUsage } = require('../models');
const { BOOKING_STATUS } = require('../config/constants');
const { processReleaseHold } = require('../jobs/releaseHoldWorker');
const { generateBookingCode } = require('../utils/bookingCode');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');

async function runTest() {
  console.log('=== Test: Release Hold Worker ===\n');

  // Reset DB
  await sequelize.sync({ force: true });

  // Create test data
  const passwordHash = await bcrypt.hash('test123', 10);
  const user = await User.create({
    email: 'test@test.com',
    password_hash: passwordHash,
    full_name: 'Test User',
    role: 'USER',
  });

  const owner = await User.create({
    email: 'owner@test.com',
    password_hash: passwordHash,
    full_name: 'Car Owner',
    role: 'CAR_OWNER',
  });

  const car = await Car.create({
    owner_id: owner.id,
    brand: 'Toyota',
    model: 'Camry',
    year: 2023,
    license_plate: '30A-99999',
    price_per_day: 1000000,
    is_available: true,
  });

  // Create booking 1: DRAFT with expired hold (should be cancelled)
  const booking1 = await Booking.create({
    booking_code: generateBookingCode(),
    renter_id: user.id,
    car_id: car.id,
    status: BOOKING_STATUS.DRAFT,
    start_date: '2026-08-01',
    end_date: '2026-08-03',
    hold_until: dayjs().subtract(5, 'minute').toDate(), // expired 5 min ago
    insurance_type: 'NONE',
  });
  await BookingHistory.create({
    booking_id: booking1.id,
    from_status: null,
    to_status: BOOKING_STATUS.DRAFT,
    changed_by: user.id,
    reason: 'Test draft',
  });

  // Create booking 2: PENDING_PAYMENT with expired hold (should be cancelled)
  const coupon = await Coupon.create({
    code: 'TEST10',
    type: 'PERCENTAGE',
    value: 10,
    usage_limit: 100,
    used_count: 1,
    per_user_limit: 1,
    is_active: true,
  });

  const booking2 = await Booking.create({
    booking_code: generateBookingCode(),
    renter_id: user.id,
    car_id: car.id,
    status: BOOKING_STATUS.PENDING_PAYMENT,
    start_date: '2026-09-01',
    end_date: '2026-09-05',
    hold_until: dayjs().subtract(1, 'minute').toDate(), // expired 1 min ago
    insurance_type: 'PREMIUM',
    coupon_id: coupon.id,
    coupon_code: 'TEST10',
    num_days: 4,
    price_per_day: 1000000,
    base_price: 4000000,
    insurance_price_per_day: 120000,
    insurance_total: 480000,
    subtotal: 4480000,
    discount_amount: 200000,
    total_price: 4280000,
    confirmed_at: dayjs().subtract(20, 'minute').toDate(),
  });
  await BookingHistory.create({
    booking_id: booking2.id,
    from_status: BOOKING_STATUS.DRAFT,
    to_status: BOOKING_STATUS.PENDING_PAYMENT,
    changed_by: user.id,
    reason: 'Test confirm',
  });
  await CouponUsage.create({
    coupon_id: coupon.id,
    user_id: user.id,
    booking_id: booking2.id,
    discount_amount: 200000,
  });

  // Create booking 3: DRAFT with active hold (should NOT be cancelled)
  const booking3 = await Booking.create({
    booking_code: generateBookingCode(),
    renter_id: user.id,
    car_id: car.id,
    status: BOOKING_STATUS.DRAFT,
    start_date: '2026-10-01',
    end_date: '2026-10-03',
    hold_until: dayjs().add(10, 'minute').toDate(), // still active
    insurance_type: 'NONE',
  });

  console.log('Before worker scan:');
  console.log(`  Booking #${booking1.id} (DRAFT, expired): ${booking1.status}`);
  console.log(`  Booking #${booking2.id} (PENDING_PAYMENT, expired): ${booking2.status}`);
  console.log(`  Booking #${booking3.id} (DRAFT, active): ${booking3.status}`);
  console.log(`  Coupon TEST10 used_count: ${coupon.used_count}`);

  // Run the worker
  console.log('\n--- Running release-hold worker ---\n');
  const result = await processReleaseHold({ name: 'release-hold-job' });
  console.log('Worker result:', result);

  // Check results
  await booking1.reload();
  await booking2.reload();
  await booking3.reload();
  await coupon.reload();

  console.log('\nAfter worker scan:');
  console.log(`  Booking #${booking1.id}: ${booking1.status} ${booking1.status === 'CANCELLED' ? '✅' : '❌'}`);
  console.log(`  Booking #${booking2.id}: ${booking2.status} ${booking2.status === 'CANCELLED' ? '✅' : '❌'}`);
  console.log(`  Booking #${booking3.id}: ${booking3.status} ${booking3.status === 'DRAFT' ? '✅' : '❌'}`);
  console.log(`  Coupon TEST10 used_count: ${coupon.used_count} ${coupon.used_count === 0 ? '✅ (reverted)' : '❌'}`);

  // Check history entries
  const histories = await BookingHistory.findAll({
    where: { to_status: BOOKING_STATUS.CANCELLED },
    order: [['id', 'ASC']],
  });
  console.log(`  Cancel history entries: ${histories.length} ${histories.length === 2 ? '✅' : '❌'}`);

  // Check CouponUsage was deleted for booking2
  const usages = await CouponUsage.findAll({ where: { booking_id: booking2.id } });
  console.log(`  CouponUsage for booking2 deleted: ${usages.length === 0 ? '✅' : '❌'}`);

  // Summary
  const allPassed =
    booking1.status === 'CANCELLED' &&
    booking2.status === 'CANCELLED' &&
    booking3.status === 'DRAFT' &&
    coupon.used_count === 0 &&
    histories.length === 2 &&
    usages.length === 0;

  console.log(`\n=== ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'} ===`);

  await sequelize.close();
  process.exit(allPassed ? 0 : 1);
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
