// tests/vas-pricing.service.test.js — ENT-Day 2 unit tests
import { buildCostSummary } from '../src/services/tripExpenseCalculator.js';
import {
  computeVasLineTotal,
  resolveVasUnitPrice,
} from '../src/services/vasPricing.service.js';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

const { default: prisma } = await import('../src/config/db.js');

describe('vas-pricing.service', () => {
  let corporate;
  let vasActive;
  let vasInactive;

  beforeAll(async () => {
    const stamp = `${Date.now()}`.slice(-7);
    corporate = await prisma.corporateClient.create({
      data: {
        name: `VAS Price Co ${stamp}`,
        taxCode: `41${stamp}`.slice(0, 10),
        priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      },
    });
    vasActive = await prisma.valueAddedService.create({
      data: {
        code: `VAS_A_${stamp}`,
        name: 'Phiên dịch test',
        unit: 'người/chuyến',
        basePrice: 500000,
        requiresHeadcount: true,
        isActive: true,
      },
    });
    vasInactive = await prisma.valueAddedService.create({
      data: {
        code: `VAS_I_${stamp}`,
        name: 'VAS inactive',
        unit: 'buổi',
        basePrice: 100000,
        requiresHeadcount: false,
        isActive: false,
      },
    });
    await prisma.corporateVASPrice.create({
      data: {
        corporateId: corporate.id,
        vasId: vasActive.id,
        price: 450000, // negotiated lower than base
      },
    });
  });

  afterAll(async () => {
    if (corporate) await prisma.corporateClient.delete({ where: { id: corporate.id } }).catch(() => {});
    if (vasActive) await prisma.valueAddedService.delete({ where: { id: vasActive.id } }).catch(() => {});
    if (vasInactive) {
      await prisma.valueAddedService.delete({ where: { id: vasInactive.id } }).catch(() => {});
    }
  });

  test('công ty có CorporateVASPrice → dùng giá đàm phán, không basePrice', async () => {
    const { unitPrice, negotiated } = await resolveVasUnitPrice(corporate.id, vasActive.id);
    expect(negotiated).toBe(true);
    expect(unitPrice).toBe(450000);
    expect(unitPrice).not.toBe(500000);
  });

  test('không có giá riêng → fallback basePrice', async () => {
    // Create a fresh VAS without negotiated price
    const stamp = `${Date.now()}`.slice(-6);
    const bare = await prisma.valueAddedService.create({
      data: {
        code: `VAS_B_${stamp}`,
        name: 'Bare',
        unit: 'buổi',
        basePrice: 777000,
        isActive: true,
        requiresHeadcount: false,
      },
    });
    try {
      const { unitPrice, negotiated } = await resolveVasUnitPrice(corporate.id, bare.id);
      expect(negotiated).toBe(false);
      expect(unitPrice).toBe(777000);
    } finally {
      await prisma.valueAddedService.delete({ where: { id: bare.id } });
    }
  });

  test('totalPrice = headcount × unitPrice — integer VND, no float', () => {
    const line = computeVasLineTotal({
      headcount: 2,
      unitPrice: 500000,
      vas: { isActive: true },
    });
    expect(line.headcount).toBe(2);
    expect(line.unitPrice).toBe(500000);
    expect(line.totalPrice).toBe(1_000_000);
    expect(Number.isInteger(line.totalPrice)).toBe(true);
  });

  test('headcount = 0 → INVALID_HEADCOUNT', () => {
    expect(() =>
      computeVasLineTotal({ headcount: 0, unitPrice: 100, vas: { isActive: true } })
    ).toThrow(/headcount/i);
  });

  test('VAS isActive false → VAS_INACTIVE', () => {
    expect(() =>
      computeVasLineTotal({
        headcount: 1,
        unitPrice: 100,
        vas: { isActive: false },
      })
    ).toThrow(/ngưng/i);
  });

  test('CANCELLED VAS not counted in cost-summary; PENDING still counted', () => {
    const s = buildCostSummary({
      basePrice: 1_300_000,
      expenses: [],
      vasLines: [
        {
          name: 'Phiên dịch viên',
          headcount: 2,
          unitPrice: 500000,
          totalPrice: 1_000_000,
          status: 'PENDING',
        },
        {
          name: 'Bảo vệ',
          headcount: 1,
          unitPrice: 800000,
          totalPrice: 800000,
          status: 'CANCELLED',
        },
      ],
    });
    expect(s.vas).toHaveLength(1);
    expect(s.vasTotal).toBe(1_000_000);
    expect(s.subtotal).toBe(2_300_000);
    expect(s.vat10).toBe(230_000);
    expect(s.total).toBe(2_530_000);
  });

  test('cost-summary: base + VAS + approved expenses + VAT 10%', () => {
    // base 1.3M + interpreter 1M + security 0.8M + toll 0.12M = 3.22M
    // VAT 322k → total 3.542M
    const s = buildCostSummary({
      basePrice: 1_300_000,
      expenses: [
        { type: 'TOLL_ROAD', amount: 120_000, approvedByAdmin: true },
        { type: 'PARKING', amount: 50_000, approvedByAdmin: false },
      ],
      vasLines: [
        { name: 'Phiên dịch viên', headcount: 2, unitPrice: 500000, totalPrice: 1_000_000 },
        { name: 'Bảo vệ', headcount: 1, unitPrice: 800000, totalPrice: 800000 },
      ],
    });
    expect(s.basePrice).toBe(1_300_000);
    expect(s.vasTotal).toBe(1_800_000);
    expect(s.expenseTotal).toBe(120_000);
    expect(s.subtotal).toBe(3_220_000);
    expect(s.vat10).toBe(322_000);
    expect(s.total).toBe(3_542_000);
  });
});
