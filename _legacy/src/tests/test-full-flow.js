/**
 * Full E2E flow test for Day 13
 * Tests: DRAFT → update insurance/coupon → confirm → PENDING_PAYMENT → auto cancel
 *
 * Run: node src/tests/test-full-flow.js
 */
require('dotenv').config();

const { sequelize, Booking, BookingHistory, Car, User, Coupon, CouponUsage } = require('../models');
const BookingService = require('../services/bookingService');
const { processReleaseHold } = require('../jobs/releaseHoldWorker');
const { BOOKING_STATUS, INSURANCE_TYPE } = require('../config/constants');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== Day 13 Full E2E Test ===\n');

  // Setup
  await sequelize.sync({ force: true });
  const passwordHash = await bcrypt.hash('test123', 10);

  const renter = await User.create({
    email: 'renter@test.com', password_hash: passwordHash,
    full_name: 'Renter', role: 'USER',
  });
  const admin = await User.create({
    email: 'admin@test.com', password_hash: passwordHash,
    full_name: 'Admin', role: 'ADMIN',
  });
  const owner = await User.create({
    email: 'owner@test.com', password_hash: passwordHash,
    full_name: 'Owner', role: 'CAR_OWNER',
  });
  const stranger = await User.create({
    email: 'stranger@test.com', password_hash: passwordHash,
    full_name: 'Stranger', role: 'USER',
  });

  const car = await Car.create({
    owner_id: owner.id, brand: 'Toyota', model: 'Camry 2.5Q',
    year: 2023, license_plate: '30A-12345',
    price_per_day: 1200000, is_available: true,
  });

  const coupon = await Coupon.create({
    code: 'WELCOME10', type: 'PERCENTAGE', value: 10,
    max_discount: 200000, min_order_value: 500000,
    usage_limit: 100, used_count: 0, per_user_limit: 1,
    starts_at: new Date('2024-01-01'), expires_at: new Date('2027-12-31'),
    is_active: true,
  });

  const fixedCoupon = await Coupon.create({
    code: 'FLAT100K', type: 'FIXED', value: 100000,
    min_order_value: 1000000, usage_limit: 50, used_count: 0,
    per_user_limit: 2, is_active: true,
  });

  // ============================================
  console.log('1. Create DRAFT booking');
  // ============================================
  const draft = await BookingService.createDraft({
    renterId: renter.id, carId: car.id,
    startDate: '2026-07-01', endDate: '2026-07-04',
    pickupTime: '08:00', returnTime: '18:00',
    pickupLocation: 'Quan 1', renterNote: 'Test booking',
  });
  assert(draft.status === 'DRAFT', 'Status is DRAFT');
  assert(draft.booking_code.startsWith('BK-'), 'Has booking code');
  assert(draft.hold_until !== null, 'Has hold_until set');
  assert(draft.insurance_type === 'NONE', 'Default insurance is NONE');

  // Check BookingHistory created
  const historyCount = await BookingHistory.count({ where: { booking_id: draft.id } });
  assert(historyCount === 1, 'BookingHistory entry created for DRAFT');

  // ============================================
  console.log('\n2. Update insurance to PREMIUM');
  // ============================================
  const updated = await BookingService.updateInsurance(draft.id, renter.id, 'PREMIUM');
  assert(updated.insurance_type === 'PREMIUM', 'Insurance updated to PREMIUM');

  // Test invalid insurance type
  try {
    await BookingService.updateInsurance(draft.id, renter.id, 'INVALID');
    assert(false, 'Should reject invalid insurance type');
  } catch (e) {
    assert(e.statusCode === 400, 'Rejects invalid insurance type');
  }

  // Test forbidden (wrong user)
  try {
    await BookingService.updateInsurance(draft.id, stranger.id, 'BASIC');
    assert(false, 'Should reject wrong user');
  } catch (e) {
    assert(e.statusCode === 403, 'Rejects wrong user for insurance update');
  }

  // ============================================
  console.log('\n3. Apply coupon WELCOME10');
  // ============================================
  const withCoupon = await BookingService.applyCoupon(draft.id, renter.id, 'WELCOME10');
  assert(withCoupon.coupon_id === coupon.id, 'Coupon ID set');
  assert(withCoupon.coupon_code === 'WELCOME10', 'Coupon code set');

  // ============================================
  console.log('\n4. Confirm booking (DRAFT → PENDING_PAYMENT)');
  // ============================================
  const confirmed = await BookingService.confirmBooking(draft.id, renter.id);
  assert(confirmed.status === 'PENDING_PAYMENT', 'Status is PENDING_PAYMENT');
  assert(confirmed.confirmed_at !== null, 'confirmed_at is set');

  // Pricing recompute check (anti-tampering)
  assert(Number(confirmed.num_days) === 3, 'num_days = 3');
  assert(Number(confirmed.price_per_day) === 1200000, 'price_per_day = 1,200,000 (from car)');
  assert(Number(confirmed.base_price) === 3600000, 'base_price = 3,600,000');
  assert(Number(confirmed.insurance_price_per_day) === 120000, 'insurance PREMIUM 120,000/day');
  assert(Number(confirmed.insurance_total) === 360000, 'insurance_total = 360,000');
  assert(Number(confirmed.subtotal) === 3960000, 'subtotal = 3,960,000');
  assert(Number(confirmed.discount_amount) === 200000, 'discount capped at max_discount 200,000');
  assert(Number(confirmed.total_price) === 3760000, 'total_price = 3,760,000');

  // BookingHistory for confirm
  const confirmHistories = await BookingHistory.count({ where: { booking_id: draft.id } });
  assert(confirmHistories === 2, 'Two BookingHistory entries (DRAFT + PENDING_PAYMENT)');

  // CouponUsage created
  const usage = await CouponUsage.findOne({ where: { booking_id: draft.id } });
  assert(usage !== null, 'CouponUsage created');
  assert(Number(usage.discount_amount) === 200000, 'CouponUsage discount = 200,000');

  // Coupon used_count incremented
  await coupon.reload();
  assert(coupon.used_count === 1, 'Coupon used_count incremented to 1');

  // ============================================
  console.log('\n5. Cannot confirm again');
  // ============================================
  try {
    await BookingService.confirmBooking(draft.id, renter.id);
    assert(false, 'Should reject double confirm');
  } catch (e) {
    assert(e.statusCode === 400, 'Double confirm rejected');
  }

  // ============================================
  console.log('\n6. GET booking detail');
  // ============================================
  // As renter
  const detailRenter = await BookingService.getBookingDetail(draft.id, renter.id, 'USER');
  assert(detailRenter.booking.status === 'PENDING_PAYMENT', 'Renter can see booking');
  assert(detailRenter.pricing_breakdown.num_days === 3, 'Breakdown has num_days');
  assert(detailRenter.pricing_breakdown.insurance.type === 'PREMIUM', 'Breakdown has insurance');
  assert(detailRenter.pricing_breakdown.coupon.code === 'WELCOME10', 'Breakdown has coupon');
  assert(detailRenter.history.length === 2, 'History included');

  // As admin
  const detailAdmin = await BookingService.getBookingDetail(draft.id, admin.id, 'ADMIN');
  assert(detailAdmin.booking.status === 'PENDING_PAYMENT', 'Admin can see booking');

  // As car owner
  const detailOwner = await BookingService.getBookingDetail(draft.id, owner.id, 'CAR_OWNER');
  assert(detailOwner.booking.status === 'PENDING_PAYMENT', 'Car owner can see booking');

  // As stranger (should fail)
  try {
    await BookingService.getBookingDetail(draft.id, stranger.id, 'USER');
    assert(false, 'Stranger should be rejected');
  } catch (e) {
    assert(e.statusCode === 403, 'Stranger cannot view booking');
  }

  // ============================================
  console.log('\n7. Auto-cancel expired booking (release-hold worker)');
  // ============================================
  // Create a new booking that will expire
  const expiring = await BookingService.createDraft({
    renterId: renter.id, carId: car.id,
    startDate: '2026-08-01', endDate: '2026-08-03',
    pickupTime: '09:00', returnTime: '17:00',
  });

  // Manually expire the hold
  await expiring.update({ hold_until: dayjs().subtract(1, 'minute').toDate() });

  // Run worker
  const result = await processReleaseHold({ name: 'release-hold-job' });
  assert(result.cancelled >= 1, 'Worker cancelled at least 1 booking');

  await expiring.reload();
  assert(expiring.status === 'CANCELLED', 'Expired booking auto-cancelled');
  assert(expiring.cancel_reason.includes('Auto-cancelled'), 'Has auto-cancel reason');
  assert(expiring.cancelled_at !== null, 'cancelled_at is set');

  // ============================================
  // Summary
  // ============================================
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`  ${failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log(`${'='.repeat(50)}`);

  await sequelize.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
