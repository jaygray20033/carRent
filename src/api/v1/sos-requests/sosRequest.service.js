// src/api/v1/sos-requests/sosRequest.service.js
// Day 39 (UC-34/35/36) — roadside SOS requests.
//   create      — Customer, booking must be IN_USE; finds nearest rescue station,
//                 stores the request, notifies + emails all OPERATORs
//   getMine     — Customer, latest requests for a booking (status polling)
//   getById     — owner or staff detail
//   list        — admin/operator, filter by status
//   review      — operator, advance status (DISPATCHED/ON_THE_WAY/RESOLVED/CANCELLED)
//                 + save a BookingHistory row
//   replacement — operator, spin up a replacement DRAFT booking for the customer
import prisma from '../../../config/db.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../utils/apiError.js';
import { BOOKING_STATUS } from '../../../config/constants.js';
import { generateBookingCode } from '../../../utils/bookingCode.js';
import { notificationService } from '../../../services/notificationService.js';
import { sendEmail } from '../../../integrations/email.js';
import logger from '../../../config/logger.js';

const STATUSES = ['REQUESTED', 'DISPATCHED', 'ON_THE_WAY', 'RESOLVED', 'CANCELLED'];
const OPEN_STATUSES = ['REQUESTED', 'DISPATCHED', 'ON_THE_WAY'];

// Haversine distance in km between two lat/lng points.
const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Rough ETA: assume 40 km/h average response speed, +5 min dispatch overhead.
const estimateArrival = (distanceKm) => {
  const minutes = Math.round((distanceKm / 40) * 60) + 5;
  return new Date(Date.now() + minutes * 60 * 1000);
};

// Pick the nearest active rescue station to the incident coordinates.
async function findNearestStation(lat, lng) {
  const stations = await prisma.rescueStation.findMany({ where: { isActive: true } });
  let nearest = null;
  for (const s of stations) {
    const distanceKm = haversineKm(lat, lng, s.latitude, s.longitude);
    if (!nearest || distanceKm < nearest.distanceKm) nearest = { station: s, distanceKm };
  }
  return nearest; // null when no active station exists
}

export const sosRequestService = {
  /** Customer — raise an SOS for a booking that is currently IN_USE. */
  async create(userId, { bookingId, latitude, longitude, issueType, description, photos }) {
    const booking = await prisma.booking.findUnique({ where: { id: Number(bookingId) } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.userId !== userId) {
      throw new ForbiddenError('Bạn không có quyền tạo yêu cầu cho đơn này.');
    }
    if (booking.status !== BOOKING_STATUS.IN_USE) {
      throw new ConflictError('Chỉ có thể gửi cứu hộ khi xe đang trong chuyến (IN_USE).');
    }

    // Block a second open request on the same booking.
    const open = await prisma.sosRequest.findFirst({
      where: { bookingId: Number(bookingId), status: { in: OPEN_STATUSES } },
    });
    if (open) throw new ConflictError('Đơn này đã có một yêu cầu cứu hộ đang xử lý.');

    const nearest = await findNearestStation(latitude, longitude);

    const sos = await prisma.sosRequest.create({
      data: {
        bookingId: Number(bookingId),
        userId,
        latitude,
        longitude,
        issueType,
        description: description || null,
        photos: photos && photos.length ? JSON.stringify(photos) : null,
        rescueStationId: nearest?.station.id ?? null,
        distanceKm: nearest?.distanceKm ?? null,
        estimatedArrival: nearest ? estimateArrival(nearest.distanceKm) : null,
      },
      include: { rescueStation: true, booking: { select: { bookingCode: true } } },
    });

    // Notify every operator/admin — in-app + email (best-effort).
    await notifyOperators(sos, booking);

    return sos;
  },

  /** Customer — requests for a booking they own, newest first (status polling). */
  async listForBooking(userId, bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: Number(bookingId) } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.userId !== userId) throw new ForbiddenError('Không có quyền xem đơn này.');

    return prisma.sosRequest.findMany({
      where: { bookingId: Number(bookingId) },
      orderBy: [{ createdAt: 'desc' }],
      include: { rescueStation: true, replacementBooking: { select: { id: true, bookingCode: true } } },
    });
  },

  /** Owner or staff — single request detail. */
  async getById(id, { userId, isStaff }) {
    const sos = await prisma.sosRequest.findUnique({
      where: { id: Number(id) },
      include: {
        rescueStation: true,
        booking: { select: { id: true, bookingCode: true, userId: true } },
        replacementBooking: { select: { id: true, bookingCode: true, status: true } },
        user: { select: { id: true, fullName: true, phone: true, email: true } },
      },
    });
    if (!sos) throw new NotFoundError('SOS request');
    if (!isStaff && sos.userId !== userId) {
      throw new ForbiddenError('Không có quyền xem yêu cầu này.');
    }
    return sos;
  },

  /** Admin/operator — list, newest first, optional status filter. */
  async list({ status, page = 1, size = 20 }) {
    const where = {};
    if (status && STATUSES.includes(status)) where.status = status;

    const [items, total] = await Promise.all([
      prisma.sosRequest.findMany({
        where,
        include: {
          rescueStation: { select: { id: true, name: true, phone: true } },
          booking: { select: { id: true, bookingCode: true } },
          user: { select: { id: true, fullName: true, phone: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.sosRequest.count({ where }),
    ]);
    return { items, total, page, size };
  },

  /**
   * Operator — advance the SOS status. DISPATCHED carries driver + optional eta;
   * RESOLVED/CANCELLED carry a resolution note. Records a BookingHistory row.
   */
  async review(id, body, operatorId) {
    const sos = await prisma.sosRequest.findUnique({ where: { id: Number(id) } });
    if (!sos) throw new NotFoundError('SOS request');
    if (['RESOLVED', 'CANCELLED'].includes(sos.status)) {
      throw new ConflictError('Yêu cầu này đã kết thúc.');
    }

    const { status, driverName, driverPhone, estimatedArrival, resolutionNote } = body;

    const data = { status, handledBy: operatorId };
    if (driverName !== undefined) data.driverName = driverName || null;
    if (driverPhone !== undefined) data.driverPhone = driverPhone || null;
    if (estimatedArrival !== undefined) {
      data.estimatedArrival = estimatedArrival ? new Date(estimatedArrival) : null;
    }
    if (resolutionNote !== undefined) data.resolutionNote = resolutionNote || null;

    const updated = await prisma.sosRequest.update({
      where: { id: Number(id) },
      data,
      include: { rescueStation: true, booking: { select: { bookingCode: true } } },
    });

    // Track the change on the booking timeline (best-effort).
    await prisma.bookingHistory
      .create({
        data: {
          bookingId: sos.bookingId,
          fromStatus: null,
          toStatus: `SOS_${status}`,
          changedBy: operatorId,
          note: resolutionNote || `SOS #${sos.id} → ${status}`,
          metadata: JSON.stringify({ sosId: sos.id, driverName, driverPhone }),
        },
      })
      .catch((e) => logger?.warn?.(`SOS bookingHistory failed: ${e.message}`));

    // Notify the customer of the status change (best-effort).
    await notificationService.notify({
      userId: sos.userId,
      type: `SOS_${status}`,
      title: STATUS_TITLES[status] || 'Cập nhật yêu cầu cứu hộ',
      body: STATUS_BODIES[status]
        ? STATUS_BODIES[status](updated)
        : `Yêu cầu cứu hộ của bạn: ${status}`,
      link: `/me/bookings/${sos.bookingId}`,
    });

    return updated;
  },

  /**
   * Operator — create a replacement DRAFT booking for the same customer + vehicle
   * window and link it back to the SOS. Cloned from the original booking's terms.
   */
  async createReplacement(id, { vehicleId }, operatorId) {
    const sos = await prisma.sosRequest.findUnique({
      where: { id: Number(id) },
      include: { booking: true },
    });
    if (!sos) throw new NotFoundError('SOS request');
    if (sos.replacementBookingId) {
      throw new ConflictError('Yêu cầu này đã có xe thay thế.');
    }

    const original = sos.booking;
    const targetVehicleId = vehicleId ? Number(vehicleId) : original.vehicleId;
    const vehicle = await prisma.vehicle.findUnique({ where: { id: targetVehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle');

    const now = new Date();
    // Replacement covers the remaining window (now → original return), min 1 day.
    const returnAt = original.returnAt > now ? original.returnAt : new Date(now.getTime() + 86400000);
    const totalDays = Math.max(1, Math.ceil((returnAt - now) / 86400000));
    const pricePerDay = vehicle.pricePerDay;
    const subtotal = pricePerDay * totalDays;

    const replacement = await prisma.booking.create({
      data: {
        bookingCode: generateBookingCode(),
        userId: original.userId,
        vehicleId: targetVehicleId,
        pickupStationId: vehicle.stationId ?? null,
        dropoffStationId: vehicle.stationId ?? null,
        rentalType: original.rentalType,
        pickupAt: now,
        returnAt,
        totalDays,
        pricePerDay,
        subtotal,
        insuranceFee: 0,
        couponDiscount: 0,
        totalAmount: subtotal,
        status: BOOKING_STATUS.CONFIRMED,
        note: `Xe thay thế cho đơn ${original.bookingCode} (SOS #${sos.id})`,
        history: {
          create: {
            toStatus: BOOKING_STATUS.CONFIRMED,
            changedBy: operatorId,
            note: `Replacement for SOS #${sos.id}`,
          },
        },
      },
    });

    await prisma.sosRequest.update({
      where: { id: Number(id) },
      data: { replacementBookingId: replacement.id },
    });

    await notificationService.notify({
      userId: original.userId,
      type: 'SOS_REPLACEMENT_READY',
      title: 'Đã sắp xếp xe thay thế',
      body: `Xe thay thế ${replacement.bookingCode} đã được chuẩn bị cho bạn.`,
      link: `/me/bookings/${replacement.id}`,
    });

    return replacement;
  },
};

// ─── Notification copy ──────────────────────────────────────────────
const STATUS_TITLES = {
  DISPATCHED: 'Đã điều động cứu hộ',
  ON_THE_WAY: 'Đội cứu hộ đang trên đường',
  RESOLVED: 'Yêu cầu cứu hộ đã hoàn tất',
  CANCELLED: 'Yêu cầu cứu hộ đã huỷ',
};
const STATUS_BODIES = {
  DISPATCHED: (s) =>
    s.driverName
      ? `Tài xế ${s.driverName}${s.driverPhone ? ` (${s.driverPhone})` : ''} đang được điều động tới bạn.`
      : 'Đội cứu hộ đã được điều động tới vị trí của bạn.',
  ON_THE_WAY: () => 'Đội cứu hộ đang trên đường tới vị trí của bạn.',
  RESOLVED: () => 'Yêu cầu cứu hộ của bạn đã được xử lý xong. Cảm ơn bạn đã kiên nhẫn.',
  CANCELLED: () => 'Yêu cầu cứu hộ của bạn đã bị huỷ.',
};

// Fan out an in-app notification + email to every ADMIN/OPERATOR. Best-effort:
// failures are logged, never thrown into the customer's happy path.
async function notifyOperators(sos, booking) {
  try {
    const operators = await prisma.user.findMany({
      where: { role: { code: { in: ['ADMIN', 'OPERATOR'] } } },
      select: { id: true, email: true, fullName: true },
    });

    const title = 'Yêu cầu cứu hộ mới (SOS)';
    const body = `Đơn ${booking.bookingCode} — sự cố ${sos.issueType} tại (${sos.latitude.toFixed(
      4
    )}, ${sos.longitude.toFixed(4)}).`;

    await Promise.all(
      operators.map(async (op) => {
        await notificationService.notify({
          userId: op.id,
          type: 'SOS_NEW',
          title,
          body,
          link: `/admin/sos-requests`,
        });
        if (op.email) {
          await sendEmail({
            to: op.email,
            template: 'otp', // reuse a generic template if no sos-specific one exists
            subject: `[SOS] ${title} — ${booking.bookingCode}`,
            data: {
              name: op.fullName,
              title,
              body,
              stationName: sos.rescueStation?.name || 'Chưa gán trạm',
            },
          }).catch(() => {});
        }
      })
    );
  } catch (e) {
    logger?.warn?.(`notifyOperators failed: ${e.message}`);
  }
}

export default sosRequestService;
