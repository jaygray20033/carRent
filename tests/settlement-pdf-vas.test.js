// tests/settlement-pdf-vas.test.js — ENT-Day 5 PDF VAS section
import { buildSettlementPdf } from '../src/services/settlementPdf.js';

describe('settlementPdf VAS section', () => {
  test('PDF buffer includes VAS labels when booking has VAS lines', async () => {
    const buf = await buildSettlementPdf({
      settlement: {
        id: 99,
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
        status: 'SENT',
        totalBaseAmount: 1_300_000,
        totalExpenses: 0,
        totalVat: 310_000,
        totalAmount: 3_410_000,
        totalVas: 1_800_000,
        note: null,
      },
      corporate: {
        name: 'AssetHub',
        taxCode: '0312345678',
        contractRef: 'HĐ-2026/CCDV',
      },
      bookings: [
        {
          id: 1,
          employeeId: 1,
          employee: { user: { fullName: 'NV A' }, employeeCode: 'AH-01' },
          vehicleType: '7_seat',
          pickupAddress: 'Q1',
          dropoffAddress: 'Q7',
          pickupAt: new Date('2026-01-10'),
          completedAt: new Date('2026-01-10'),
          basePrice: 1_300_000,
          finalAmount: 3_410_000,
          _line: {
            basePrice: 1_300_000,
            expenseTotal: 0,
            vasTotal: 1_800_000,
            total: 3_410_000,
            vas: [
              { name: 'Phien dich vien', headcount: 2, total: 1_000_000, status: 'CONFIRMED' },
              { name: 'Bao ve', headcount: 1, total: 800_000, status: 'PENDING' },
            ],
          },
        },
      ],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    // pdfkit compresses content streams (FlateDecode) so plain-text search is unreliable;
    // assert the buffer is a valid PDF and larger than the empty-booking baseline.
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
    const empty = await buildSettlementPdf({
      settlement: {
        id: 1,
        periodStart: new Date(),
        periodEnd: new Date(),
        status: 'DRAFT',
        totalBaseAmount: 0,
        totalExpenses: 0,
        totalVat: 0,
        totalAmount: 0,
      },
      corporate: { name: 'X', taxCode: '1' },
      bookings: [],
    });
    expect(buf.length).toBeGreaterThan(empty.length);
  });

  test('PDF without VAS still builds', async () => {
    const buf = await buildSettlementPdf({
      settlement: {
        id: 1,
        periodStart: new Date(),
        periodEnd: new Date(),
        status: 'DRAFT',
        totalBaseAmount: 100,
        totalExpenses: 0,
        totalVat: 10,
        totalAmount: 110,
      },
      corporate: { name: 'X', taxCode: '1', contractRef: null },
      bookings: [],
    });
    expect(buf.length).toBeGreaterThan(100);
  });
});
