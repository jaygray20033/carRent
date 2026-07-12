// tests/adminVehicles.test.js — admin vehicle management (UC-53)
//
// Routes (src/api/v1/admin/vehicles/*, ADMIN|OPERATOR):
//   GET    /admin/vehicles            — list incl. non-AVAILABLE, ?status= ?q=
//   GET    /admin/vehicles/:id        — detail
//   POST   /admin/vehicles            — create (201; 422 on missing/invalid fields; 409 dupe)
//   PATCH  /admin/vehicles/:id        — update
//   DELETE /admin/vehicles/:id        — soft delete → status=RETIRED
//   PATCH  /admin/vehicles/:id/status — quick status (AVAILABLE|MAINTENANCE|RETIRED)
//   GET    /admin/vehicles/:id/bookings — booking history
//
// NOTE on "delete with future booking → conflict": the real softDelete() does NOT
// guard against active/future bookings — it simply flips status to RETIRED and
// keeps bookings intact (see adminVehicle.service.js softDelete). So there is no
// 409 branch to test here; we assert the documented behavior (RETIRED, bookings
// preserved) instead of inventing a guard that doesn't exist.
//
// Strategy mirrors adminDashboard.test.js: mint JWTs directly, talk to real MySQL.
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 1000);

const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

let adminRole;
let customerRole;
let admin;
let adminToken;
let customer;
let customerToken;
let brand;
let seededVehicle; // pre-seeded so list/status/bookings have a target
const createdVehicleIds = []; // vehicles created via the API (for teardown)
const createdBookingIds = [];

beforeAll(async () => {
  adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Quản trị viên', description: 'Admin' },
  });
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  admin = await prisma.user.create({
    data: {
      roleId: adminRole.id,
      fullName: 'Vehicle Admin',
      phone: `096${stamp}`.slice(0, 10),
      email: `vehadmin_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  adminToken = signToken(admin.id);

  customer = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Vehicle Customer',
      phone: `097${stamp}`.slice(0, 10),
      email: `vehcust_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  customerToken = signToken(customer.id);

  brand = await prisma.brand.upsert({
    where: { slug: `veh-brand-${stamp}` },
    update: {},
    create: { name: `VehBrand${stamp}`, slug: `veh-brand-${stamp}` },
  });

  seededVehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: `Seeded Car ${stamp}`,
      slug: `veh-seeded-${stamp}`,
      modelYear: 2024,
      licensePlate: `77A-${stamp}`.slice(0, 20),
      pricePerDay: 700_000,
      status: 'MAINTENANCE', // non-AVAILABLE → proves admin list shows all statuses
    },
  });
  createdVehicleIds.push(seededVehicle.id);
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { id: { in: createdBookingIds } } }).catch(() => {});
  // Remove any images attached to created vehicles before deleting the vehicles.
  await prisma.vehicleImage
    .deleteMany({ where: { vehicleId: { in: createdVehicleIds } } })
    .catch(() => {});
  await prisma.vehicle.deleteMany({ where: { id: { in: createdVehicleIds } } }).catch(() => {});
  await prisma.brand.delete({ where: { id: brand.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, customer.id] } } }).catch(() => {});
  await prisma.$disconnect();
});

// ─── RBAC ──────────────────────────────────────────────────────────────
describe('Admin vehicles — RBAC (UC-53)', () => {
  it('401 without a token', async () => {
    const res = await request(app).get(`${BASE}/admin/vehicles`);
    expect(res.status).toBe(401);
  });

  it('403 for a non-admin (CUSTOMER) user', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/vehicles`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── List / detail ─────────────────────────────────────────────────────
describe('GET /admin/vehicles — list (UC-53)', () => {
  it('returns a paginated list including non-AVAILABLE vehicles', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/vehicles?q=${stamp}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    const found = res.body.data.find((v) => v.id === seededVehicle.id);
    expect(found).toBeDefined();
    expect(found.status).toBe('MAINTENANCE');
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/vehicles?status=MAINTENANCE&q=${stamp}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((v) => v.status === 'MAINTENANCE')).toBe(true);
  });

  it('422 for an invalid status enum', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/vehicles?status=INACTIVE`) // INACTIVE is not a real status
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('detail returns the vehicle; 404 for unknown id', async () => {
    const ok = await request(app)
      .get(`${BASE}/admin/vehicles/${seededVehicle.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.vehicle.id).toBe(seededVehicle.id);

    const missing = await request(app)
      .get(`${BASE}/admin/vehicles/999999999`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });
});

// ─── Create ─────────────────────────────────────────────────────────────
describe('POST /admin/vehicles — create (UC-53)', () => {
  it('422 when required fields are missing', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/vehicles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'x' }); // missing brandId, slug, modelYear, licensePlate, pricePerDay
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('201 creates a vehicle and persists it', async () => {
    const body = {
      brandId: brand.id,
      name: `Created Car ${stamp}`,
      slug: `veh-created-${stamp}`,
      modelYear: 2024,
      licensePlate: `78B-${stamp}`.slice(0, 20),
      pricePerDay: 1_200_000,
      status: 'AVAILABLE',
    };
    const res = await request(app)
      .post(`${BASE}/admin/vehicles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(res.status).toBe(201);
    const vehicle = res.body.data.vehicle;
    createdVehicleIds.push(vehicle.id);
    expect(vehicle.slug).toBe(body.slug);
    expect(vehicle.pricePerDay).toBe(1_200_000);

    const row = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
    expect(row).not.toBeNull();
    expect(row.licensePlate).toBe(body.licensePlate);
  });

  it('409 on a duplicate slug/licensePlate', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/vehicles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandId: brand.id,
        name: 'Dup Car',
        slug: `veh-seeded-${stamp}`, // clashes with the seeded vehicle
        modelYear: 2024,
        licensePlate: `79C-${stamp}`.slice(0, 20),
        pricePerDay: 500_000,
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE');
  });
});

// ─── Update / status / soft delete ──────────────────────────────────────
describe('PATCH/DELETE /admin/vehicles/:id — mutations (UC-53)', () => {
  it('updates mutable fields', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/vehicles/${seededVehicle.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pricePerDay: 750_000, color: 'Đỏ' });
    expect(res.status).toBe(200);
    expect(res.body.data.vehicle.pricePerDay).toBe(750_000);

    const row = await prisma.vehicle.findUnique({ where: { id: seededVehicle.id } });
    expect(row.pricePerDay).toBe(750_000);
  });

  it('quick status change to AVAILABLE', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/vehicles/${seededVehicle.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'AVAILABLE' });
    expect(res.status).toBe(200);
    expect(res.body.data.vehicle.status).toBe('AVAILABLE');

    const row = await prisma.vehicle.findUnique({ where: { id: seededVehicle.id } });
    expect(row.status).toBe('AVAILABLE');
  });

  it('422 when status change targets a non-allowed value (RENTED)', async () => {
    // RENTED is driven by the booking lifecycle, not settable by admins here.
    const res = await request(app)
      .patch(`${BASE}/admin/vehicles/${seededVehicle.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'RENTED' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('soft delete flips status to RETIRED and keeps bookings intact', async () => {
    // Seed a future booking on this vehicle to prove softDelete does NOT block it
    // and does NOT remove the booking (there is no future-booking guard in source).
    const futureBooking = await prisma.booking.create({
      data: {
        bookingCode: `VEH-${stamp}-FUT`,
        userId: customer.id,
        vehicleId: seededVehicle.id,
        rentalType: 'SELF_DRIVE',
        pickupAt: new Date(Date.now() + 5 * 86400000),
        returnAt: new Date(Date.now() + 7 * 86400000),
        totalDays: 2,
        pricePerDay: 750_000,
        subtotal: 1_500_000,
        totalAmount: 1_500_000,
        status: 'CONFIRMED',
      },
    });
    createdBookingIds.push(futureBooking.id);

    const res = await request(app)
      .delete(`${BASE}/admin/vehicles/${seededVehicle.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.vehicle.status).toBe('RETIRED');

    const row = await prisma.vehicle.findUnique({ where: { id: seededVehicle.id } });
    expect(row.status).toBe('RETIRED');
    // The future booking is untouched.
    const stillThere = await prisma.booking.findUnique({ where: { id: futureBooking.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere.status).toBe('CONFIRMED');
  });

  it('404 when soft-deleting an unknown vehicle', async () => {
    const res = await request(app)
      .delete(`${BASE}/admin/vehicles/999999999`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

// ─── Booking history ─────────────────────────────────────────────────────
describe('GET /admin/vehicles/:id/bookings (UC-53)', () => {
  it('returns the booking history for the vehicle', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/vehicles/${seededVehicle.id}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    // The future booking we seeded above belongs to this vehicle.
    expect(res.body.data.every((b) => b.vehicleId === seededVehicle.id)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('404 for an unknown vehicle id', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/vehicles/999999999/bookings`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
