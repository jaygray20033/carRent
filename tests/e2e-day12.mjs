// Day 12 E2E smoke test — insurance plans, PATCH booking, coupon validate
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';

const prisma = new PrismaClient();
const BASE = 'http://localhost:4000/api/v1';
const SECRET = process.env.JWT_ACCESS_SECRET || 'dev_access_secret';

const log = (t, r) => console.log(`\n=== ${t} ===\n` + JSON.stringify(r, null, 2));

async function main() {
  // pick a customer user + an available vehicle
  const user = await prisma.user.findFirst({ where: { email: 'nkv@gmail.com' } });
  const vehicle = await prisma.vehicle.findFirst();
  if (!user || !vehicle) throw new Error('Need seeded user + vehicle');

  const token = jwt.sign({ userId: user.id, role: 'CUSTOMER' }, SECRET, { expiresIn: '1h' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // clean prior draft for this user+vehicle
  await prisma.booking.deleteMany({ where: { userId: user.id, status: 'DRAFT' } });

  const pickupAt = dayjs().add(2, 'day').toDate();
  const returnAt = dayjs().add(5, 'day').toDate();
  const totalDays = 3;
  const subtotal = vehicle.pricePerDay * totalDays;

  const booking = await prisma.booking.create({
    data: {
      bookingCode: 'OTR-TEST-' + Date.now(),
      userId: user.id,
      vehicleId: vehicle.id,
      rentalType: 'SELF_DRIVE',
      pickupAt, returnAt,
      pickupPoint: 'Hà Nội',
      totalDays,
      pricePerDay: vehicle.pricePerDay,
      subtotal,
      totalAmount: subtotal,
      status: 'DRAFT',
      holdUntil: dayjs().add(15, 'minute').toDate(),
    },
  });
  console.log(`Created DRAFT booking #${booking.id}, subtotal=${subtotal}, vehiclePrice/day=${vehicle.pricePerDay}`);

  // 1) GET /insurance-plans
  log('GET /insurance-plans', await (await fetch(`${BASE}/insurance-plans`)).json());

  // 2) PATCH /bookings/:id — add PREMIUM (10%) + dropoff
  const premium = await prisma.insurancePlan.findUnique({ where: { code: 'PREMIUM' } });
  const patchRes = await fetch(`${BASE}/bookings/${booking.id}`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ insurancePlanId: premium.id, dropoffPoint: 'Hải Phòng' }),
  });
  log(`PATCH /bookings/${booking.id} (PREMIUM + dropoff)`, await patchRes.json());

  // 3) POST /coupons/validate — FIXED 50k (min 500k)
  log('POST /coupons/validate WELCOME50K', await (await fetch(`${BASE}/coupons/validate`, {
    method: 'POST', headers: auth, body: JSON.stringify({ code: 'WELCOME50K', bookingId: booking.id }),
  })).json());

  // 4) PERCENT coupon
  log('POST /coupons/validate SUMMER10', await (await fetch(`${BASE}/coupons/validate`, {
    method: 'POST', headers: auth, body: JSON.stringify({ code: 'SUMMER10', bookingId: booking.id }),
  })).json());

  // 5) Expired coupon → 422
  const exp = await fetch(`${BASE}/coupons/validate`, {
    method: 'POST', headers: auth, body: JSON.stringify({ code: 'EXPIRED2025', bookingId: booking.id }),
  });
  log(`POST /coupons/validate EXPIRED2025 (HTTP ${exp.status})`, await exp.json());

  // 6) Unknown coupon → 422
  const bad = await fetch(`${BASE}/coupons/validate`, {
    method: 'POST', headers: auth, body: JSON.stringify({ code: 'NOPE', bookingId: booking.id }),
  });
  log(`POST /coupons/validate NOPE (HTTP ${bad.status})`, await bad.json());

  // 7) min_order not met (VIP20 needs 5,000,000) — likely fails depending on subtotal
  const vip = await fetch(`${BASE}/coupons/validate`, {
    method: 'POST', headers: auth, body: JSON.stringify({ code: 'VIP20', bookingId: booking.id }),
  });
  log(`POST /coupons/validate VIP20 (HTTP ${vip.status})`, await vip.json());

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
