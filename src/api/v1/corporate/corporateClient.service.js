// src/api/v1/corporate/corporateClient.service.js
// B2B Day 2 — UC-61 Corporate Client CRUD (OtoRent Admin).
import prisma from '../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  UnprocessableError,
} from '../../../utils/apiError.js';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../../../constants/corporatePricing.js';

/** taxCode must be 10–13 digits (optional hyphen for 13-digit branch form). */
export function validateTaxCode(taxCode) {
  const raw = String(taxCode ?? '').trim();
  // Accept 10 digits, or 10+3 with optional hyphen (e.g. 0123456789-001)
  const digits = raw.replace(/-/g, '');
  if (!/^\d{10,13}$/.test(digits)) {
    throw new UnprocessableError(
      'Mã số thuế phải gồm 10–13 chữ số',
      'TAX_CODE_INVALID'
    );
  }
  return raw;
}

function parsePriceConfig(raw) {
  if (!raw) return DEFAULT_CORPORATE_PRICE_CONFIG;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_CORPORATE_PRICE_CONFIG;
  }
}

function serializeClient(client) {
  if (!client) return client;
  return {
    ...client,
    priceConfig: parsePriceConfig(client.priceConfig),
  };
}

export const corporateClientService = {
  async create(data) {
    const taxCode = validateTaxCode(data.taxCode);

    const existing = await prisma.corporateClient.findUnique({ where: { taxCode } });
    if (existing) {
      throw new ConflictError('Mã số thuế đã tồn tại', 'TAX_CODE_CONFLICT');
    }

    const priceConfig =
      data.priceConfig != null
        ? typeof data.priceConfig === 'string'
          ? data.priceConfig
          : JSON.stringify(data.priceConfig)
        : JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG);

    const client = await prisma.corporateClient.create({
      data: {
        name: data.name,
        taxCode,
        address: data.address || null,
        contactName: data.contactName || null,
        contactPhone: data.contactPhone || null,
        contactEmail: data.contactEmail || null,
        contractRef: data.contractRef || null,
        contractStart: data.contractStart ? new Date(data.contractStart) : null,
        contractEnd: data.contractEnd ? new Date(data.contractEnd) : null,
        creditLimit: data.creditLimit ?? 0,
        paymentTermDays: data.paymentTermDays ?? 0,
        priceConfig,
        isActive: data.isActive ?? true,
      },
    });
    return serializeClient(client);
  },

  async list({ q, isActive, page = 1, size = 20 } = {}) {
    const where = {};
    if (typeof isActive === 'boolean') where.isActive = isActive;
    if (q && String(q).trim()) {
      const term = String(q).trim();
      where.OR = [
        { name: { contains: term } },
        { taxCode: { contains: term } },
        { contractRef: { contains: term } },
        { contactName: { contains: term } },
        { contactPhone: { contains: term } },
        { contactEmail: { contains: term } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.corporateClient.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
        include: {
          _count: { select: { employees: true, bookings: true, settlements: true } },
        },
      }),
      prisma.corporateClient.count({ where }),
    ]);

    // UC-72 Day 7 — enrich each row with month trips / revenue / unpaid settlements.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const ids = items.map((c) => c.id);

    const [monthBookings, unpaidSettlements] = ids.length
      ? await Promise.all([
          prisma.corporateBooking.findMany({
            where: {
              corporateId: { in: ids },
              pickupAt: { gte: monthStart, lt: monthEnd },
              status: { not: 'CANCELLED' },
            },
            select: {
              corporateId: true,
              basePrice: true,
              finalAmount: true,
              status: true,
            },
          }),
          prisma.corporateSettlement.findMany({
            where: {
              corporateId: { in: ids },
              status: { in: ['SENT', 'CONFIRMED', 'DISPUTED'] },
            },
            select: { corporateId: true, totalAmount: true, status: true },
          }),
        ])
      : [[], []];

    const tripsMap = new Map(); // id → { trips, revenue }
    for (const b of monthBookings) {
      const row = tripsMap.get(b.corporateId) || { totalTripsThisMonth: 0, totalRevenue: 0 };
      row.totalTripsThisMonth += 1;
      row.totalRevenue += Math.round(Number(b.finalAmount ?? b.basePrice ?? 0));
      tripsMap.set(b.corporateId, row);
    }
    const debtMap = new Map(); // id → pendingSettlement amount
    for (const s of unpaidSettlements) {
      debtMap.set(
        s.corporateId,
        (debtMap.get(s.corporateId) || 0) + Math.round(Number(s.totalAmount || 0))
      );
    }

    const enriched = items.map((c) => {
      const kpis = tripsMap.get(c.id) || { totalTripsThisMonth: 0, totalRevenue: 0 };
      const pendingSettlement = debtMap.get(c.id) || 0;
      let contractStatus = 'ACTIVE';
      if (!c.isActive) contractStatus = 'INACTIVE';
      else if (c.contractEnd && new Date(c.contractEnd).getTime() < Date.now()) {
        contractStatus = 'EXPIRED';
      }
      return {
        ...serializeClient(c),
        totalTripsThisMonth: kpis.totalTripsThisMonth,
        totalRevenue: kpis.totalRevenue,
        pendingSettlement,
        contractStatus,
      };
    });

    return {
      items: enriched,
      total,
      page,
      size,
    };
  },

  async getById(id) {
    const client = await prisma.corporateClient.findUnique({
      where: { id: Number(id) },
      include: {
        _count: { select: { employees: true, bookings: true, settlements: true } },
      },
    });
    if (!client) throw new NotFoundError('Corporate client');
    return serializeClient(client);
  },

  async update(id, data) {
    const existing = await prisma.corporateClient.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Corporate client');

    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.address !== undefined) patch.address = data.address;
    if (data.contactName !== undefined) patch.contactName = data.contactName;
    if (data.contactPhone !== undefined) patch.contactPhone = data.contactPhone;
    if (data.contactEmail !== undefined) patch.contactEmail = data.contactEmail;
    if (data.contractRef !== undefined) patch.contractRef = data.contractRef;
    if (data.contractStart !== undefined) {
      patch.contractStart = data.contractStart ? new Date(data.contractStart) : null;
    }
    if (data.contractEnd !== undefined) {
      patch.contractEnd = data.contractEnd ? new Date(data.contractEnd) : null;
    }
    if (data.creditLimit !== undefined) patch.creditLimit = data.creditLimit;
    if (data.paymentTermDays !== undefined) patch.paymentTermDays = data.paymentTermDays;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    if (data.priceConfig !== undefined) {
      patch.priceConfig =
        typeof data.priceConfig === 'string'
          ? data.priceConfig
          : JSON.stringify(data.priceConfig);
    }

    if (data.taxCode !== undefined && data.taxCode !== existing.taxCode) {
      const taxCode = validateTaxCode(data.taxCode);
      const dup = await prisma.corporateClient.findUnique({ where: { taxCode } });
      if (dup && dup.id !== existing.id) {
        throw new ConflictError('Mã số thuế đã tồn tại', 'TAX_CODE_CONFLICT');
      }
      patch.taxCode = taxCode;
    }

    const client = await prisma.corporateClient.update({
      where: { id: Number(id) },
      data: patch,
    });
    return serializeClient(client);
  },

  async remove(id) {
    const existing = await prisma.corporateClient.findUnique({
      where: { id: Number(id) },
      include: {
        bookings: {
          where: { status: { in: ['PENDING', 'APPROVED', 'IN_PROGRESS', 'PENDING_CONFIRM'] } },
          take: 1,
        },
      },
    });
    if (!existing) throw new NotFoundError('Corporate client');
    if (existing.bookings.length > 0) {
      throw new ConflictError(
        'Không thể xoá công ty còn chuyến đang hoạt động',
        'CLIENT_HAS_ACTIVE_BOOKINGS'
      );
    }

    // Soft-delete: deactivate rather than hard-delete historical settlements.
    const client = await prisma.corporateClient.update({
      where: { id: Number(id) },
      data: { isActive: false },
    });
    return serializeClient(client);
  },

  async getPriceConfig(id) {
    const client = await this.getById(id);
    return client.priceConfig;
  },

  async updatePriceConfig(id, priceConfig) {
    if (!priceConfig || typeof priceConfig !== 'object') {
      throw new ValidationError([{ field: 'priceConfig', message: 'priceConfig is required' }]);
    }
    return this.update(id, { priceConfig });
  },
};

export default corporateClientService;
