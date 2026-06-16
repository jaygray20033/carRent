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
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { licensePlate: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.brandId) where.brandId = filters.brandId;
    if (filters.categoryId) where.categoryId = filters.categoryId;
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
      prisma.car.count({ where }),
      prisma.car.findMany({
        where,
        skip,
        take: limit,
        orderBy: buildOrderBy(filters.sort),
        include: {
          brand: true,
          category: true,
          station: { select: { id: true, name: true, city: true } },
          images: { orderBy: { sortOrder: 'asc' } },
        },
      }),
    ]);

    return { items, total, page, limit };
  },

  async getById(id) {
    const car = await prisma.car.findUnique({
      where: { id: BigInt(id) },
      include: {
        brand: true,
        category: true,
        station: true,
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!car) throw new NotFoundError('Car');
    return car;
  },

  async create(data) {
    return prisma.car.create({ data });
  },

  async update(id, data) {
    return prisma.car.update({ where: { id: BigInt(id) }, data });
  },

  async delete(id) {
    return prisma.car.delete({ where: { id: BigInt(id) } });
  },
};
