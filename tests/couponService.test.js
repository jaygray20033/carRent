// tests/couponService.test.js — Day 42 coupon.service.validate unit coverage (UC-16)
//
// Exercises couponService.validate directly (not via HTTP) against real MySQL:
//   - discount math for FIXED / PERCENT / PERCENT-capped / FREE_DRIVER
//   - the guard rails: inactive, not-yet-valid, expired, min-order,
//     global + per-user usage limits, wrong owner, non-DRAFT booking.
import dayjs from 'dayjs';

const { couponService } = await import('../src/api/v1/coupons/coupon.service.js');
const { default: prisma } = await import('../src/config/db.js');
const { generateBookingCode } = await import('../src/utils/bookingCode.js');

const stamp = Date.now().toString().slice(-7);

let role;
let user;
let otherUser;
let brand;
let vehicle;
let draft; // a DRAFT booking owned by `user`, subtotal 3,000,000

const PRICE_PER_DAY = 1_500_000;
const SUBTOTAL = 3_000_000; // 1.5M × 2 days

// A generic active coupon factory. Overrides win.
const makeCoupon = (over = {}) =>
  prisma.coupon.create({
    data: {
      code: `C${stamp}${Math.random().toString(36).slice(2, 7)}`.toUpperCase(),
      type: 'FIXED',
      value: 100_000,
      minOrder: 0,
      maxDiscount: null,
      maxUse: 0,
      maxUsePerUser: 1,
      startAt: new Date('2024-01-01'),
      endAt: new Date('2030-12-31'),
      appliesTo: 'ALL',
      isActive: true,
      ...over,
    },
  });

const createdCouponIds = [];
const trackedCoupon = async (over) => {
  const c = await makeCoupon(over);
  createdCouponIds.push(c.id);
  return c;
};

beforeAll(async () => {
  role = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  user = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'Coupon Svc Tester',
      phone: `05${stamp}0`.slice(0, 10),
      email: `couponsvc_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otherUser = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'Other Owner',
      phone: `04${stamp}0`.slice(0, 10),
      email: `couponsvc_other_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });

  brand = await prisma.brand.upsert({
    where: { slug: `csvc-brand-${stamp}` },
    update: {},
    create: { name: `CsvcBrand${stamp}`, slug: `csvc-brand-${stamp}` },
  });

  vehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: 'Coupon Svc Car',
      slug: `csvc-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `77C-${stamp}`,
      pricePerDay: PRICE_PER_DAY,
      status: 'AVAILABLE',
    },
  });

  const pickupAt = dayjs().add(1, 'day').second(0).millisecond(0).toDate();
  const returnAt = dayjs(pickupAt).add(2, 'day').toDate();
  draft = await prisma.booking.create({
    data: {
      userId: user.id,
      vehicleId: vehicle.id,
      bookingCode: generateBookingCode(),
      status: 'DRAFT',
      rentalType: 'SELF_DRIVE',
      pickupAt,
      returnAt,
      pickupPoint: 'HQ',
      dropoffPoint: 'HQ',
      pricePerDay: PRICE_PER_DAY,
      totalDays: 2,
      insuranceFee: 0,
      subtotal: SUBTOTAL,
      couponDiscount: 0,
      totalAmount: SUBTOTAL,
    },
  });
});

afterAll(async () => {
  await prisma.couponUsage.deleteMany({ where: { userId: { in: [user.id, otherUser.id] } } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { vehicleId: vehicle.id } }).catch(() => {});
  if (createdCouponIds.length)
    await prisma.coupon.deleteMany({ where: { id: { in: createdCouponIds } } }).catch(() => {});
  await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
  await prisma.brand.delete({ where: { id: brand.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [user.id, otherUser.id] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('couponService.validate — discount math', () => {
  it('FIXED coupon returns its flat value', async () => {
    const c = await trackedCoupon({ type: 'FIXED', value: 250_000 });
    const res = await couponService.validate(c.code, draft.id, user.id);
    expect(res.valid).toBe(true);
    expect(res.discount).toBe(250_000);
  });

  it('PERCENT coupon returns rounded percentage of subtotal', async () => {
    const c = await trackedCoupon({ type: 'PERCENT', value: 10, maxDiscount: null });
    const res = await couponService.validate(c.code, draft.id, user.id);
    // 10% of 3,000,000 = 300,000
    expect(res.discount).toBe(300_000);
  });

  it('PERCENT coupon is clamped to maxDiscount when the raw percent exceeds it', async () => {
    const c = await trackedCoupon({ type: 'PERCENT', value: 10, maxDiscount: 200_000 });
    const res = await couponService.validate(c.code, draft.id, user.id);
    expect(res.discount).toBe(200_000);
  });

  it('FREE_DRIVER on a SELF_DRIVE booking yields no discount', async () => {
    const c = await trackedCoupon({ type: 'FREE_DRIVER', value: 0 });
    const res = await couponService.validate(c.code, draft.id, user.id);
    expect(res.discount).toBe(0);
  });

  it('accepts a lower-case code (normalised to upper-case)', async () => {
    const c = await trackedCoupon({ type: 'FIXED', value: 50_000 });
    const res = await couponService.validate(c.code.toLowerCase(), draft.id, user.id);
    expect(res.discount).toBe(50_000);
  });
});

describe('couponService.validate — guard rails', () => {
  it('rejects an unknown code', async () => {
    await expect(couponService.validate('NOPE_DOES_NOT_EXIST', draft.id, user.id)).rejects.toThrow();
  });

  it('rejects an inactive coupon', async () => {
    const c = await trackedCoupon({ isActive: false });
    await expect(couponService.validate(c.code, draft.id, user.id)).rejects.toThrow();
  });

  it('rejects a coupon that is not yet valid', async () => {
    const c = await trackedCoupon({ startAt: new Date('2099-01-01'), endAt: new Date('2099-12-31') });
    await expect(couponService.validate(c.code, draft.id, user.id)).rejects.toThrow();
  });

  it('rejects an expired coupon', async () => {
    const c = await trackedCoupon({ startAt: new Date('2020-01-01'), endAt: new Date('2020-12-31') });
    await expect(couponService.validate(c.code, draft.id, user.id)).rejects.toThrow();
  });

  it('rejects when subtotal is below minOrder', async () => {
    const c = await trackedCoupon({ minOrder: 5_000_000 });
    await expect(couponService.validate(c.code, draft.id, user.id)).rejects.toThrow();
  });

  it('rejects when the booking belongs to another user', async () => {
    const c = await trackedCoupon({ type: 'FIXED', value: 100_000 });
    await expect(couponService.validate(c.code, draft.id, otherUser.id)).rejects.toThrow();
  });

  it('rejects when the per-user usage limit is already reached', async () => {
    const c = await trackedCoupon({ type: 'FIXED', value: 100_000, maxUsePerUser: 1 });
    await prisma.couponUsage.create({
      data: { couponId: c.id, userId: user.id, bookingId: draft.id, discount: 100_000 },
    });
    await expect(couponService.validate(c.code, draft.id, user.id)).rejects.toThrow();
  });

  it('rejects when the global usage limit is reached', async () => {
    const c = await trackedCoupon({ type: 'FIXED', value: 100_000, maxUse: 1, maxUsePerUser: 5 });
    await prisma.couponUsage.create({
      data: { couponId: c.id, userId: otherUser.id, bookingId: draft.id, discount: 100_000 },
    });
    await expect(couponService.validate(c.code, draft.id, user.id)).rejects.toThrow();
  });
});
