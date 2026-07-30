// tests/corporate-booking.validator.test.js — B2B Day 3 business-rule validators
import { corporateBookingService } from '../src/api/v1/corporate/corporateBooking.service.js';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

const { default: prisma } = await import('../src/config/db.js');

const stamp = `${Date.now()}`.slice(-8) + Math.floor(Math.random() * 90 + 10);

describe('corporate-booking business validators', () => {
  let customerRole;
  let corporate;
  let user;
  let membership;
  let inactiveMembership;
  let inactiveCorp;
  let expiredCorp;
  let expiredMembership;

  beforeAll(async () => {
    customerRole = await prisma.role.upsert({
      where: { code: 'CUSTOMER' },
      update: {},
      create: { code: 'CUSTOMER', name: 'Customer', description: 'c' },
    });

    corporate = await prisma.corporateClient.create({
      data: {
        name: `Val Co ${stamp}`,
        taxCode: `11${stamp}`.slice(0, 10),
        priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
        isActive: true,
        contractEnd: new Date(Date.now() + 365 * 86400_000),
      },
    });

    user = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Val User',
        phone: `071${stamp}`.slice(0, 10),
        email: `val_${stamp}@ex.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });

    membership = await prisma.corporateEmployee.create({
      data: {
        corporateId: corporate.id,
        userId: user.id,
        isAdmin: false,
        isActive: true,
      },
      include: { user: true, corporate: true },
    });

    inactiveCorp = await prisma.corporateClient.create({
      data: {
        name: `Inactive ${stamp}`,
        taxCode: `12${stamp}`.slice(0, 10),
        priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
        isActive: false,
      },
    });
    const u2 = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Inactive Emp',
        phone: `072${stamp}`.slice(0, 10),
        email: `inact_${stamp}@ex.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    inactiveMembership = await prisma.corporateEmployee.create({
      data: {
        corporateId: inactiveCorp.id,
        userId: u2.id,
        isAdmin: false,
        isActive: true, // membership active but company not
      },
      include: { user: true, corporate: true },
    });

    // Employee inactive
    const u3 = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Dead Emp',
        phone: `073${stamp}`.slice(0, 10),
        email: `dead_${stamp}@ex.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    // attach to active corp but isActive=false
    await prisma.corporateEmployee.create({
      data: {
        corporateId: corporate.id,
        // can't set userId if unique - use null pending style + flag
        invitedPhone: u3.phone,
        isAdmin: false,
        isActive: false,
      },
    });
    // For EMPLOYEE_INACTIVE we call create with isActive=false membership object
    membership.__inactiveClone = {
      ...membership,
      isActive: false,
      id: membership.id,
      corporateId: corporate.id,
    };

    expiredCorp = await prisma.corporateClient.create({
      data: {
        name: `Expired ${stamp}`,
        taxCode: `13${stamp}`.slice(0, 10),
        priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
        isActive: true,
        contractEnd: new Date(Date.now() - 86400_000),
      },
    });
    const u4 = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Expired Emp',
        phone: `074${stamp}`.slice(0, 10),
        email: `exp_${stamp}@ex.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    expiredMembership = await prisma.corporateEmployee.create({
      data: {
        corporateId: expiredCorp.id,
        userId: u4.id,
        isAdmin: false,
        isActive: true,
      },
      include: { user: true, corporate: true },
    });
  });

  afterAll(async () => {
    await prisma.corporateBooking.deleteMany({
      where: { corporateId: { in: [corporate.id, inactiveCorp.id, expiredCorp.id] } },
    }).catch(() => {});
    await prisma.corporateEmployee
      .deleteMany({
        where: { corporateId: { in: [corporate.id, inactiveCorp.id, expiredCorp.id] } },
      })
      .catch(() => {});
    await prisma.corporateClient
      .deleteMany({ where: { id: { in: [corporate.id, inactiveCorp.id, expiredCorp.id] } } })
      .catch(() => {});
    await prisma.user
      .deleteMany({
        where: {
          phone: {
            in: [
              `071${stamp}`.slice(0, 10),
              `072${stamp}`.slice(0, 10),
              `073${stamp}`.slice(0, 10),
              `074${stamp}`.slice(0, 10),
            ],
          },
        },
      })
      .catch(() => {});
  });

  const validBody = () => ({
    vehicleType: '4_5_seat',
    rentalType: 'half_day',
    estimatedKm: 50,
    pickupAt: new Date(Date.now() + 3 * 3600_000),
    returnAt: new Date(Date.now() + 8 * 3600_000),
    pickupAddress: 'Quận 1',
    dropoffAddress: 'Quận 7',
    purpose: 'Test',
  });

  test('pickupAt < now + 2h → BOOKING_TOO_SOON', async () => {
    await expect(
      corporateBookingService.create(membership, {
        ...validBody(),
        pickupAt: new Date(Date.now() + 30 * 60_000),
      })
    ).rejects.toMatchObject({ code: 'BOOKING_TOO_SOON' });
  });

  test('returnAt <= pickupAt → INVALID_TIME_RANGE', async () => {
    const pickup = new Date(Date.now() + 3 * 3600_000);
    await expect(
      corporateBookingService.create(membership, {
        ...validBody(),
        pickupAt: pickup,
        returnAt: pickup,
      })
    ).rejects.toMatchObject({ code: 'INVALID_TIME_RANGE' });
  });

  test('estimatedKm <= 0 → INVALID_KM', async () => {
    await expect(
      corporateBookingService.create(membership, {
        ...validBody(),
        estimatedKm: 0,
      })
    ).rejects.toMatchObject({ code: 'INVALID_KM' });
  });

  test('CorporateClient.isActive = false → CLIENT_INACTIVE', async () => {
    await expect(
      corporateBookingService.create(inactiveMembership, validBody())
    ).rejects.toMatchObject({ code: 'CLIENT_INACTIVE' });
  });

  test('contractEnd < now → CONTRACT_EXPIRED', async () => {
    await expect(
      corporateBookingService.create(expiredMembership, validBody())
    ).rejects.toMatchObject({ code: 'CONTRACT_EXPIRED' });
  });

  test('CorporateEmployee.isActive = false → EMPLOYEE_INACTIVE', async () => {
    await expect(
      corporateBookingService.create(membership.__inactiveClone, validBody())
    ).rejects.toMatchObject({ code: 'EMPLOYEE_INACTIVE' });
  });
});
