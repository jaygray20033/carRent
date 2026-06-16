// src/api/v1/bookings/booking.service.js
import prisma from '../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  AppError,
} from '../../../utils/apiError.js';
import { generateBookingCode } from '../../../utils/bookingCode.js';

const calcTotalDays = (pickupAt, returnAt) => {
  const ms = new Date(returnAt) - new Date(pickupAt);
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

export const bookingService = {
  async create(userId, payload) {
    const car = await prisma.car.findUnique({ where: { id: BigInt(payload.carId) } });
    if (!car) throw new NotFoundError('Car');
    if (car.status !== 'AVAILABLE')
      throw new ConflictError('Car is not available', 'CAR_NOT_AVAILABLE');

    // Conflict check — overlapping bookings on same car
    const overlap = await prisma.booking.findFirst({
      where: {
        carId: car.id,
        status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'IN_USE'] },
        AND: [
          { pickupAt: { lt: new Date(payload.returnAt) } },
          { returnAt: { gt: new Date(payload.pickupAt) } },
        ],
      },
    });
    if (overlap) throw new ConflictError('Car is booked for that period', 'CAR_BOOKED');

    const totalDays = calcTotalDays(payload.pickupAt, payload.returnAt);
    const pricePerDay = Number(car.pricePerDay);
    const subtotal = pricePerDay * totalDays;
    const insuranceFee = payload.insuranceFee || 0;
    const totalAmount = subtotal + insuranceFee;

    const booking = await prisma.booking.create({
      data: {
        bookingCode: generateBookingCode(),
        userId: BigInt(userId),
        carId: car.id,
        pickupStationId: payload.pickupStationId || car.stationId || null,
        dropoffStationId: payload.dropoffStationId || car.stationId || null,
        rentalType: payload.rentalType,
        pickupAt: new Date(payload.pickupAt),
        returnAt: new Date(payload.returnAt),
        totalDays,
        pricePerDay,
        subtotal,
        insuranceFee,
        totalAmount,
        status: 'PENDING_PAYMENT',
        note: payload.note,
      },
      include: { car: { include: { brand: true, category: true } } },
    });

    return booking;
  },

  async listByUser(userId, { page = 1, limit = 12, status }) {
    const where = { userId: BigInt(userId) };
    if (status) where.status = status;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          car: { include: { brand: true, category: true } },
          pickupStation: true,
          dropoffStation: true,
        },
      }),
    ]);
    return { items, total, page, limit };
  },

  async getById(userId, roleCode, id) {
    const booking = await prisma.booking.findUnique({
      where: { id: BigInt(id) },
      include: {
        car: { include: { brand: true, category: true, images: true } },
        pickupStation: true,
        dropoffStation: true,
        payments: true,
      },
    });
    if (!booking) throw new NotFoundError('Booking');

    if (roleCode !== 'ADMIN' && roleCode !== 'OPERATOR') {
      if (booking.userId.toString() !== userId.toString())
        throw new ForbiddenError('Not your booking');
    }
    return booking;
  },

  async cancel(userId, roleCode, id, reason) {
    const booking = await this.getById(userId, roleCode, id);
    if (!['DRAFT', 'PENDING_PAYMENT', 'CONFIRMED'].includes(booking.status))
      throw new AppError('Cannot cancel booking in current status', 400, 'CANNOT_CANCEL');

    return prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelReason: reason || 'User cancelled' },
    });
  },
};
