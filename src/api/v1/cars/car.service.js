// src/api/v1/cars/car.service.js
import prisma from '../../../config/db.js';
import { NotFoundError } from '../../../utils/apiError.js';

const buildOrderBy = (sort) => {
  switch (sort) {
    case 'price_asc':
      return { pricePerDay: 'asc' };
    case 'price_desc':
      return { pricePerDay: 'desc' };
    case 'rating':
      return { rating: 'desc' };
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
};

export const carService = {
  async list({ page = 1, limit = 12, ...filters }) {
    const skip = (page - 1) * limit;
    const where = {};

    if (filters.search) {
      // MySQL utf8mb4_0900_ai_ci collation is case-insensitive by default,
      // so `mode: 'insensitive'` (Postgres-only) is not needed.
      where.OR = [
        { name: { contains: filters.search } },
        { licensePlate: { contains: filters.search } },
      ];
    }
    if (filters.brandId) where.brandId = filters.brandId;
    if (filters.modelId) where.modelId = filters.modelId;
    if (filters.stationId) where.stationId = filters.stationId;
    if (filters.transmission) where.transmission = filters.transmission;
    if (filters.fuelType) where.fuelType = filters.fuelType;
    if (filters.status) where.status = filters.status;
    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      where.pricePerDay = {};
      if (filters.priceMin !== undefined) where.pricePerDay.gte = filters.priceMin;
      if (filters.priceMax !== undefined) where.pricePerDay.lte = filters.priceMax;
    }

    const [total, items] = await Promise.all([
      prisma.vehicle.count({ where }),
      prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: buildOrderBy(filters.sort),
        include: {
          brand: true,
          model: true,
          station: { select: { id: true, name: true, city: true } },
          images: { orderBy: { sortOrder: 'asc' } },
        },
      }),
    ]);

    return { items, total, page, limit };
  },

  async getById(id) {
    const car = await prisma.vehicle.findUnique({
      where: { id: BigInt(id) },
      include: {
        brand: true,
        model: true,
        station: true,
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!car) throw new NotFoundError('Vehicle');
    return car;
  },

  async create(data) {
    return prisma.vehicle.create({ data });
  },

  async update(id, data) {
    return prisma.vehicle.update({ where: { id: BigInt(id) }, data });
  },

  async delete(id) {
    return prisma.vehicle.delete({ where: { id: BigInt(id) } });
  },
};
