// src/services/cars.service.js
import prisma from '../config/prisma.js';

/**
 * List vehicles with filter, sort, pagination
 */
export async function listVehicles({
  page = 1,
  limit = 12,
  brandId,
  categoryId,
  stationId,
  seats,
  transmission,
  fuelType,
  minPrice,
  maxPrice,
  isFeatured,
  featuredTag,
  search,
  sortBy = 'createdAt',
  sortOrder = 'desc',
}) {
  const where = {};

  if (brandId) where.brandId = Number(brandId);
  if (categoryId) where.categoryId = Number(categoryId);
  if (stationId) where.stationId = Number(stationId);
  if (seats) where.seats = Number(seats);
  if (transmission) where.transmission = transmission;
  if (fuelType) where.fuelType = fuelType;
  if (isFeatured !== undefined) where.isFeatured = isFeatured === 'true' || isFeatured === true;
  if (featuredTag) where.featuredTag = featuredTag;

  if (minPrice || maxPrice) {
    where.pricePerDay = {};
    if (minPrice) where.pricePerDay.gte = Number(minPrice);
    if (maxPrice) where.pricePerDay.lte = Number(maxPrice);
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { slug: { contains: search } },
      { description: { contains: search } },
    ];
  }

  // Valid sort fields
  const validSortFields = [
    'pricePerDay',
    'rating',
    'reviewCount',
    'modelYear',
    'createdAt',
    'name',
  ];
  const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
  const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const [data, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      skip,
      take,
      orderBy: { [orderField]: orderDir },
      include: {
        brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
        model: { select: { id: true, name: true, slug: true } },
        category: { select: { id: true, name: true, slug: true } },
        station: { select: { id: true, name: true, type: true, city: true } },
        images: {
          select: { id: true, url: true, isPrimary: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    prisma.vehicle.count({ where }),
  ]);

  return { data, total, page: Number(page), limit: Number(limit) };
}

/**
 * Get vehicle detail by id
 */
export async function getVehicleById(id) {
  return prisma.vehicle.findUnique({
    where: { id: Number(id) },
    include: {
      brand: true,
      model: true,
      category: true,
      station: true,
      images: { orderBy: { sortOrder: 'asc' } },
      reviews: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      },
    },
  });
}

/**
 * Get vehicle availability — returns bookings that overlap with given range
 * Logic: a booking overlaps [from, to] if NOT (return_at <= from OR pickup_at >= to)
 * Equivalent to: return_at > from AND pickup_at < to
 */
export async function getVehicleAvailability(vehicleId, from, to) {
  const blockedBookings = await prisma.booking.findMany({
    where: {
      vehicleId: Number(vehicleId),
      status: {
        notIn: ['CANCELLED', 'REFUNDED', 'COMPLETED'],
      },
      AND: [{ returnAt: { gt: new Date(from) } }, { pickupAt: { lt: new Date(to) } }],
    },
    select: {
      id: true,
      bookingCode: true,
      pickupAt: true,
      returnAt: true,
      status: true,
    },
    orderBy: { pickupAt: 'asc' },
  });

  return blockedBookings;
}

/**
 * Check if a vehicle has overlapping bookings for a given time range
 * Used for hold logic (UC-14 preparation)
 * Returns true if there IS an overlap (vehicle NOT available)
 */
export async function hasOverlap(vehicleId, from, to, excludeBookingId = null) {
  const where = {
    vehicleId: Number(vehicleId),
    status: {
      notIn: ['CANCELLED', 'REFUNDED', 'COMPLETED'],
    },
    AND: [{ returnAt: { gt: new Date(from) } }, { pickupAt: { lt: new Date(to) } }],
  };

  if (excludeBookingId) {
    where.id = { not: Number(excludeBookingId) };
  }

  const count = await prisma.booking.count({ where });
  return count > 0;
}
