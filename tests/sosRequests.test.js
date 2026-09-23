// tests/sosRequests.test.js — Day 39 roadside SOS requests (UC-34/35/36)
//
// Customer side  (src/api/v1/sos-requests/*):
//   POST /sos-requests            — raise an SOS for an IN_USE booking (owner only)
//   GET  /sos-requests?bookingId= — poll my requests for a booking
//   GET  /sos-requests/:id        — owner or staff detail
// Admin side     (src/api/v1/admin/sos-requests/*, ADMIN|OPERATOR):
//   GET   /admin/sos-requests            — dispatch queue (paginated, ?status=)
//   PATCH /admin/sos-requests/:id        — advance status (DISPATCHED needs driverName)
//   POST  /admin/sos-requests/:id/replacement — spin up a replacement booking
//
// Strategy mirrors bookings.test.js / adminDashboard.test.js: mint JWTs directly,
// talk to real MySQL, seed a private booking + station and assert real behavior +
// real DB state. A rescue station is placed exactly on the incident coordinates so
// findNearestStation() deterministically assigns it (distance 0 = always nearest).
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 1000);

const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

// Incident coordinates; the seeded station sits on the exact same point.
const LAT = 10.762622;
const LNG = 106.660172;

let customerRole;
let adminRole;
let operatorRole;
let customer;
let customerToken;
let otherCustomer;
let otherToken;
let operator;
let operatorToken;
let brand;
let vehicle;
let station;
let inUseBooking; // status IN_USE — eligible for SOS
let confirmedBooking; // status CONFIRMED — NOT eligible
let sosId; // the primary SOS we drive through the flow
let replacementBookingId;

beforeAll(async () => {
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });
  adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Quản trị viên', description: 'Admin' },
  });
  operatorRole = await prisma.role.upsert({
    where: { code: 'OPERATOR' },
    update: {},
    create: { code: 'OPERATOR', name: 'Điều hành', description: 'Operator' },
  });

  customer = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'SOS Customer',
      phone: `081${stamp}`.slice(0, 10),
      email: `sos_cust_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  customerToken = signToken(customer.id);

  otherCustomer = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'SOS Other',
      phone: `082${stamp}`.slice(0, 10),
      email: `sos_other_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otherToken = signToken(otherCustomer.id);

  operator = await prisma.user.create({
    data: {
      roleId: operatorRole.id,
      fullName: 'SOS Operator',
      phone: `083${stamp}`.slice(0, 10),
      email: `sos_op_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  operatorToken = signToken(operator.id);

  brand = await prisma.brand.upsert({
    where: { slug: `sos-brand-${stamp}` },
    update: {},
    create: { name: `SosBrand${stamp}`, slug: `sos-brand-${stamp}` },
  });

  vehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: 'SOS Car',
      slug: `sos-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `88S-${stamp}`.slice(0, 20),
      pricePerDay: 900_000,
      status: 'RENTED',
    },
  });

  station = await prisma.rescueStation.create({
    data: {
      name: `SosStation${stamp}`,
      city: 'HCM',
      address: '1 Test Rd',
      latitude: LAT,
      longitude: LNG,
      phone: '0900000000',
      isActive: true,
    },
  });

  const base = {
    userId: customer.id,
    vehicleId: vehicle.id,
    rentalType: 'SELF_DRIVE',
    pickupAt: new Date(Date.now() - 86400000),
    returnAt: new Date(Date.now() + 86400000),
    totalDays: 2,
    pricePerDay: 900_000,
    subtotal: 1_800_000,
    totalAmount: 1_800_000,
  };

  inUseBooking = await prisma.booking.create({
    data: { ...base, bookingCode: `SOS-${stamp}-IU`, status: 'IN_USE' },
  });
  confirmedBooking = await prisma.booking.create({
    data: { ...base, bookingCode: `SOS-${stamp}-CF`, status: 'CONFIRMED' },
  });
});

afterAll(async () => {
  const userIds = [customer.id, otherCustomer.id, operator.id];
  // FK-safe teardown: notifications & history & sos rows → bookings → vehicle → station → brand → users.
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  const bookingIds = [inUseBooking.id, confirmedBooking.id];
  if (replacementBookingId) bookingIds.push(replacementBookingId);
  await prisma.bookingHistory.deleteMany({ where: { bookingId: { in: bookingIds } } }).catch(() => {});
  await prisma.sosRequest.deleteMany({ where: { bookingId: { in: bookingIds } } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } }).catch(() => {});
  await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
  await prisma.rescueStation.delete({ where: { id: station.id } }).catch(() => {});
  await prisma.brand.delete({ where: { id: brand.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  await prisma.$disconnect();
});

// ─── Customer creates an SOS (UC-34) ───────────────────────────────────
describe('POST /sos-requests — customer raises an SOS (UC-34)', () => {
  it('401 without a token', async () => {
    const res = await request(app).post(`${BASE}/sos-requests`).send({});
    expect(res.status).toBe(401);
  });

  it('404 when the booking does not exist', async () => {
    const res = await request(app)
      .post(`${BASE}/sos-requests`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ bookingId: 999_999_999, lat: LAT, lng: LNG, issueType: 'FLAT_TIRE' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('403 when the booking belongs to another user', async () => {
    const res = await request(app)
      .post(`${BASE}/sos-requests`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ bookingId: inUseBooking.id, lat: LAT, lng: LNG, issueType: 'FLAT_TIRE' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('422 when issueType is missing / invalid', async () => {
    const res = await request(app)
      .post(`${BASE}/sos-requests`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ bookingId: inUseBooking.id, lat: LAT, lng: LNG });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('409 when the booking is not IN_USE (CONFIRMED)', async () => {
    const res = await request(app)
      .post(`${BASE}/sos-requests`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ bookingId: confirmedBooking.id, lat: LAT, lng: LNG, issueType: 'FLAT_TIRE' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('201 creates an SOS on the IN_USE booking and assigns the nearest station', async () => {
    const res = await request(app)
      .post(`${BASE}/sos-requests`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId: inUseBooking.id,
        lat: LAT,
        lng: LNG,
        issueType: 'DEAD_BATTERY',
        description: 'Battery died on the highway',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const sos = res.body.data.sosRequest;
    sosId = sos.id;
    expect(sos.status).toBe('REQUESTED');
    expect(sos.issueType).toBe('DEAD_BATTERY');
    expect(sos.rescueStationId).toBe(station.id); // distance 0 → deterministically nearest
    expect(sos.distanceKm).toBeCloseTo(0, 3);

    // DB state matches the response.
    const row = await prisma.sosRequest.findUnique({ where: { id: sosId } });
    expect(row).not.toBeNull();
    expect(row.userId).toBe(customer.id);
    expect(row.bookingId).toBe(inUseBooking.id);
    expect(row.status).toBe('REQUESTED');
  });

  it('409 for a second open request on the same booking', async () => {
    const res = await request(app)
      .post(`${BASE}/sos-requests`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ bookingId: inUseBooking.id, lat: LAT, lng: LNG, issueType: 'ACCIDENT' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

// ─── Customer reads their SOS (UC-35 polling) ──────────────────────────
describe('GET /sos-requests — customer reads their own SOS', () => {
  it('lists the requests for a booking the customer owns', async () => {
    const res = await request(app)
      .get(`${BASE}/sos-requests?bookingId=${inUseBooking.id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    expect(Array.isArray(items)).toBe(true);
    expect(items.some((s) => s.id === sosId)).toBe(true);
  });

  it('403 when listing a booking owned by another user', async () => {
    const res = await request(app)
      .get(`${BASE}/sos-requests?bookingId=${inUseBooking.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('owner can fetch the SOS by id', async () => {
    const res = await request(app)
      .get(`${BASE}/sos-requests/${sosId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sosRequest.id).toBe(sosId);
  });

  it('403 when a different customer fetches the SOS by id', async () => {
    const res = await request(app)
      .get(`${BASE}/sos-requests/${sosId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── Admin dispatch queue (UC-35) ──────────────────────────────────────
describe('Admin SOS dispatch queue — RBAC + flow (UC-35)', () => {
  it('401 without a token', async () => {
    const res = await request(app).get(`${BASE}/admin/sos-requests`);
    expect(res.status).toBe(401);
  });

  it('403 for a non-staff (CUSTOMER) user', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/sos-requests`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('operator sees the paginated queue including our request', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/sos-requests`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(res.body.data.some((s) => s.id === sosId)).toBe(true);
  });

  it('422 when moving to DISPATCHED without a driver name', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/sos-requests/${sosId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'DISPATCHED' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('DISPATCHED with driver + etaMinutes updates the record', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/sos-requests/${sosId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'DISPATCHED', driverName: 'Anh Tài', driverPhone: '0912345678', etaMinutes: 20 });
    expect(res.status).toBe(200);
    const sos = res.body.data.sosRequest;
    expect(sos.status).toBe('DISPATCHED');
    expect(sos.driverName).toBe('Anh Tài');

    const row = await prisma.sosRequest.findUnique({ where: { id: sosId } });
    expect(row.status).toBe('DISPATCHED');
    expect(row.driverName).toBe('Anh Tài');
    expect(row.handledBy).toBe(operator.id);
    expect(row.estimatedArrival).not.toBeNull(); // etaMinutes → absolute time
  });

  it('RESOLVED with a resolution note closes the request', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/sos-requests/${sosId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'RESOLVED', resolutionNote: 'Jump-started, back on the road' });
    expect(res.status).toBe(200);
    expect(res.body.data.sosRequest.status).toBe('RESOLVED');

    const row = await prisma.sosRequest.findUnique({ where: { id: sosId } });
    expect(row.status).toBe('RESOLVED');
    expect(row.resolutionNote).toBe('Jump-started, back on the road');
  });

  it('409 when advancing an already-closed request', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/sos-requests/${sosId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'CANCELLED', resolutionNote: 'too late' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('404 for an unknown SOS id', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/sos-requests/999999999`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'ON_THE_WAY' });
    expect(res.status).toBe(404);
  });
});

// ─── Replacement booking (UC-36) ───────────────────────────────────────
describe('POST /admin/sos-requests/:id/replacement (UC-36)', () => {
  it('creates a replacement CONFIRMED booking linked to the SOS', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/sos-requests/${sosId}/replacement`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ vehicleId: vehicle.id });
    expect(res.status).toBe(201);
    const booking = res.body.data.booking;
    replacementBookingId = booking.id;
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.userId).toBe(customer.id);

    // The SOS row now points at the replacement booking.
    const sos = await prisma.sosRequest.findUnique({ where: { id: sosId } });
    expect(sos.replacementBookingId).toBe(replacementBookingId);
  });

  it('409 when a replacement already exists', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/sos-requests/${sosId}/replacement`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ vehicleId: vehicle.id });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});
