// ENT-Day 2 — UC-76/77 Value-Added Services service layer.
import prisma from '../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableError,
} from '../../../utils/apiError.js';
import {
  resolveVasUnitPrice,
  computeVasLineTotal,
  listCorporateVasPricing,
} from '../../../services/vasPricing.service.js';
import { buildCostSummary } from '../../../services/tripExpenseCalculator.js';
import { notificationService } from '../../../services/notificationService.js';
import {
  VAS_ADDABLE_BOOKING_STATUSES,
  VAS_DELETABLE_BOOKING_STATUSES,
} from '../../../constants/enterpriseVas.js';

async function loadBookingForMember(membership, bookingId) {
  const booking = await prisma.corporateBooking.findUnique({
    where: { id: Number(bookingId) },
    include: {
      expenses: true,
      bookingVAS: { include: { vas: true } },
      employee: {
        select: {
          id: true,
          userId: true,
          user: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!booking) throw new NotFoundError('Corporate booking');
  if (booking.corporateId !== membership.corporateId) {
    throw new ForbiddenError('Không thuộc công ty của bạn');
  }
  if (!membership.isAdmin && booking.employeeId !== membership.id) {
    throw new ForbiddenError('Bạn chỉ thao tác trên chuyến của mình');
  }
  return booking;
}

async function notifyCarGoGoAdmins(payload) {
  const admins = await prisma.user.findMany({
    where: { status: 'ACTIVE', role: { code: 'ADMIN' } },
    select: { id: true },
    take: 20,
  });
  await Promise.all(
    admins.map((a) => notificationService.notify({ userId: a.id, ...payload }))
  );
}

export const vasService = {
  /** Public catalog — active VAS only. */
  async listActiveCatalog() {
    const items = await prisma.valueAddedService.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    return items.map((v) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      description: v.description,
      unit: v.unit,
      basePrice: Math.round(Number(v.basePrice) || 0),
      requiresHeadcount: v.requiresHeadcount,
      isActive: v.isActive,
    }));
  },

  async listMyVasPricing(membership) {
    return listCorporateVasPricing(membership.corporateId);
  },

  async createVas(data) {
    const code = String(data.code || '')
      .trim()
      .toUpperCase();
    if (!code) throw new UnprocessableError('code bắt buộc', 'INVALID_VAS_CODE');

    const existing = await prisma.valueAddedService.findUnique({ where: { code } });
    if (existing) throw new ConflictError('VAS code đã tồn tại', 'VAS_CODE_EXISTS');

    const basePrice = Math.round(Number(data.basePrice));
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      throw new UnprocessableError('basePrice không hợp lệ', 'INVALID_BASE_PRICE');
    }

    return prisma.valueAddedService.create({
      data: {
        code,
        name: String(data.name).trim(),
        description: data.description || null,
        unit: String(data.unit).trim(),
        basePrice,
        isActive: data.isActive !== false,
        requiresHeadcount: data.requiresHeadcount !== false,
      },
    });
  },

  async updateVas(id, data) {
    const vas = await prisma.valueAddedService.findUnique({ where: { id: Number(id) } });
    if (!vas) throw new NotFoundError('Value-added service');

    const patch = {};
    if (data.name !== undefined) patch.name = String(data.name).trim();
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.unit !== undefined) patch.unit = String(data.unit).trim();
    if (data.basePrice !== undefined) {
      const basePrice = Math.round(Number(data.basePrice));
      if (!Number.isFinite(basePrice) || basePrice < 0) {
        throw new UnprocessableError('basePrice không hợp lệ', 'INVALID_BASE_PRICE');
      }
      patch.basePrice = basePrice;
    }
    if (data.isActive !== undefined) patch.isActive = Boolean(data.isActive);
    if (data.requiresHeadcount !== undefined) {
      patch.requiresHeadcount = Boolean(data.requiresHeadcount);
    }

    return prisma.valueAddedService.update({ where: { id: vas.id }, data: patch });
  },

  /**
   * Replace/upsert negotiated prices for a corporate client.
   * Body: { prices: [{ vasId, price, note? }] }
   */
  async setCorporateVasPricing(corporateId, { prices }) {
    const client = await prisma.corporateClient.findUnique({
      where: { id: Number(corporateId) },
    });
    if (!client) throw new NotFoundError('Corporate client');
    if (!Array.isArray(prices)) {
      throw new UnprocessableError('prices phải là mảng', 'INVALID_PRICES');
    }

    const results = [];
    for (const row of prices) {
      const vasId = Number(row.vasId);
      const price = Math.round(Number(row.price));
      if (!Number.isFinite(vasId) || vasId < 1) {
        throw new UnprocessableError('vasId không hợp lệ', 'INVALID_VAS_ID');
      }
      if (!Number.isFinite(price) || price < 0) {
        throw new UnprocessableError('price không hợp lệ', 'INVALID_PRICE');
      }
      const vas = await prisma.valueAddedService.findUnique({ where: { id: vasId } });
      if (!vas) throw new NotFoundError('Value-added service');

      const saved = await prisma.corporateVASPrice.upsert({
        where: {
          corporateId_vasId: {
            corporateId: client.id,
            vasId,
          },
        },
        update: { price, note: row.note || null },
        create: {
          corporateId: client.id,
          vasId,
          price,
          note: row.note || null,
        },
      });
      results.push(saved);
    }
    return results;
  },

  async addBookingVas(membership, bookingId, data) {
    const booking = await loadBookingForMember(membership, bookingId);
    if (!VAS_ADDABLE_BOOKING_STATUSES.has(booking.status)) {
      throw new ConflictError(
        `Không thêm VAS khi booking ${booking.status}`,
        'BOOKING_LOCKED_FOR_VAS'
      );
    }

    const { vas, unitPrice } = await resolveVasUnitPrice(
      booking.corporateId,
      data.vasId,
      { requireActive: true }
    );
    const { headcount, totalPrice } = computeVasLineTotal({
      headcount: data.headcount ?? 1,
      unitPrice,
      vas,
    });

    const line = await prisma.bookingVAS.create({
      data: {
        corporateBookingId: booking.id,
        vasId: vas.id,
        headcount,
        unitPrice,
        totalPrice,
        note: data.note || null,
        status: 'PENDING',
      },
      include: { vas: true },
    });

    await notifyCarGoGoAdmins({
      type: 'CORPORATE_BOOKING_VAS_ADDED',
      title: `Booking #${booking.id} yêu cầu thêm VAS`,
      body: `Booking #${booking.id} yêu cầu thêm [${vas.name} x${headcount} người]`,
      link: `/admin/corporate/bookings`,
    }).catch(() => {});

    return line;
  },

  async removeBookingVas(membership, bookingId, vasLineId) {
    const booking = await loadBookingForMember(membership, bookingId);
    if (!VAS_DELETABLE_BOOKING_STATUSES.has(booking.status)) {
      throw new ConflictError(
        `Chỉ xoá VAS khi booking PENDING (hiện: ${booking.status})`,
        'BOOKING_LOCKED_FOR_VAS'
      );
    }

    const line = await prisma.bookingVAS.findFirst({
      where: {
        id: Number(vasLineId),
        corporateBookingId: booking.id,
      },
    });
    if (!line) throw new NotFoundError('Booking VAS');

    await prisma.bookingVAS.delete({ where: { id: line.id } });
    return { id: line.id, deleted: true };
  },

  async assignProvider(bookingId, vasLineId, { providerId }) {
    const booking = await prisma.corporateBooking.findUnique({
      where: { id: Number(bookingId) },
      include: {
        employee: { select: { userId: true } },
      },
    });
    if (!booking) throw new NotFoundError('Corporate booking');

    const line = await prisma.bookingVAS.findFirst({
      where: {
        id: Number(vasLineId),
        corporateBookingId: booking.id,
      },
      include: { vas: true },
    });
    if (!line) throw new NotFoundError('Booking VAS');

    const pid = providerId == null ? null : Number(providerId);
    if (pid != null && (!Number.isFinite(pid) || pid < 1)) {
      throw new UnprocessableError('providerId không hợp lệ', 'INVALID_PROVIDER');
    }

    const updated = await prisma.bookingVAS.update({
      where: { id: line.id },
      data: {
        providerId: pid,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
      include: { vas: true },
    });

    if (booking.employee?.userId) {
      await notificationService.notify({
        userId: booking.employee.userId,
        type: 'CORPORATE_BOOKING_VAS_CONFIRMED',
        title: 'VAS đã được xác nhận',
        body: `${line.vas?.name || 'Dịch vụ'} trên chuyến #${booking.id} đã được assign`,
        link: `/enterprise/schedule`,
      });
    }

    return updated;
  },

  async costSummary(membership, bookingId) {
    const booking = await loadBookingForMember(membership, bookingId);
    return buildCostSummary({
      basePrice: booking.basePrice,
      expenses: booking.expenses || [],
      vasLines: booking.bookingVAS || [],
    });
  },
};

export default vasService;
