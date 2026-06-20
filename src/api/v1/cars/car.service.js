// src/api/v1/cars/car.service.js
import prisma from '../../../config/db.js';
import { NotFoundError } from '../../../utils/apiError.js';
import { buildCacheKey, cached } from '../../../utils/cache.js';

const LIST_CACHE_TTL = 300; // 5 minutes (§ Cache list theo querystring TTL 5 phút)

/**
 * UC-11 — Sort options.
 * price_asc | price_desc | newest | popular | rating
 */
const buildOrderBy = (sort) => {
  switch (sort) {
    case 'price_asc':
      return [{ pricePerDay: 'asc' }];
    case 'price_desc':
      return [{ pricePerDay: 'desc' }];
    case 'rating':
      return [{ rating: 'desc' }, { reviewCount: 'desc' }];
    case 'popular':
      return [{ totalBookings: 'desc' }, { reviewCount: 'desc' }, { rating: 'desc' }];
    case 'newest':
    default:
      return [{ createdAt: 'desc' }];
  }
};

/**
 * UC-10 — Build a Prisma `where` from the validated query filters.
 */
const buildWhere = (f) => {
  const where = {};

  // Only list rentable cars by default unless an explicit status is provided
  where.status = f.status || 'AVAILABLE';

  if (f.category) where.category = { slug: f.category };
  if (f.brand) where.brand = { slug: f.brand };
  if (f.brandId) where.brandId = f.brandId;
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.modelId) where.modelId = f.modelId;
  if (f.stationId || f.station_id) where.stationId = f.stationId || f.station_id;
  if (f.transmission) where.transmission = f.transmission;
  if (f.fuel) where.fuelType = f.fuel;
  if (f.fuelType) where.fuelType = f.fuelType;
  if (f.featuredTag) where.featuredTag = f.featuredTag;

  // Seats range
  if (f.seats_min !== undefined || f.seats_max !== undefined) {
    where.seats = {};
    if (f.seats_min !== undefined) where.seats.gte = f.seats_min;
    if (f.seats_max !== undefined) where.seats.lte = f.seats_max;
  } else if (f.seats !== undefined) {
    where.seats = f.seats;
  }

  // Price range (price_min / price_max — VND/day)
  const priceMin = f.price_min ?? f.priceMin;
  const priceMax = f.price_max ?? f.priceMax;
  if (priceMin !== undefined || priceMax !== undefined) {
    where.pricePerDay = {};
    if (priceMin !== undefined) where.pricePerDay.gte = priceMin;
    if (priceMax !== undefined) where.pricePerDay.lte = priceMax;
  }

  // Free-text search (q). SQLite default collation is case-insensitive (NOCASE
  // is applied per-column; LIKE is ASCII case-insensitive). On MySQL the
  // utf8mb4_0900_ai_ci collation makes `contains` case-insensitive too, and a
  // FULLTEXT index (see migration note) speeds up the model/brand name lookup.
  const q = f.q ?? f.search;
  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { name: { contains: term } },
      { description: { contains: term } },
      { licensePlate: { contains: term } },
      { brand: { name: { contains: term } } },
      { model: { name: { contains: term } } },
    ];
  }

  return where;
};

const listInclude = {
  brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
  category: { select: { id: true, name: true, slug: true } },
  model: { select: { id: true, name: true, slug: true } },
  station: { select: { id: true, name: true, city: true } },
  images: { orderBy: { sortOrder: 'asc' }, take: 1 },
};

export const carService = {
  /**
   * UC-10 + UC-11 — list with filter, sort, pagination, and 5-min cache.
   */
  async list(query) {
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const limit = Number(query.limit) > 0 ? Math.min(Number(query.limit), 100) : 12;
    const skip = (page - 1) * limit;

    const where = buildWhere(query);
    const orderBy = buildOrderBy(query.sort);

    const cacheKey = buildCacheKey('cars:list', { ...query, page, limit });

    const { data, cached: isCached } = await cached(cacheKey, LIST_CACHE_TTL, async () => {
      const [total, rows] = await Promise.all([
        prisma.vehicle.count({ where }),
        prisma.vehicle.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: listInclude,
        }),
      ]);

      // Shape: vehicleModel + thumbnail + min price (§ Trả về vehicleModel + ảnh thumbnail + giá min)
      const items = rows.map((v) => ({
        ...v,
        thumbnailUrl: v.thumbnailUrl || v.images?.[0]?.url || null,
        minPrice: v.pricePerDay,
        vehicleModel: v.model || null,
      }));

      return { items, total, page, limit };
    });

    return { ...data, cached: isCached };
  },

  /**
   * UC-search — auto-complete on vehicle model names + brand names.
   * Returns lightweight suggestions for the search dropdown.
   */
  async autocomplete(q, limit = 8) {
    const term = (q || '').trim();
    if (!term) return { models: [], brands: [], vehicles: [] };

    const cacheKey = buildCacheKey('cars:search', { q: term, limit });

    const { data } = await cached(cacheKey, 120, async () => {
      const [models, brands, vehicles] = await Promise.all([
        prisma.vehicleModel.findMany({
          where: { name: { contains: term } },
          take: limit,
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            seats: true,
            transmission: true,
            fuelType: true,
            brand: { select: { id: true, name: true, slug: true } },
          },
        }),
        prisma.brand.findMany({
          where: { name: { contains: term } },
          take: limit,
          orderBy: { name: 'asc' },
          select: { id: true, name: true, slug: true, logoUrl: true },
        }),
        prisma.vehicle.findMany({
          where: {
            status: 'AVAILABLE',
            OR: [{ name: { contains: term } }, { brand: { name: { contains: term } } }],
          },
          take: limit,
          orderBy: [{ totalBookings: 'desc' }, { rating: 'desc' }],
          select: {
            id: true,
            name: true,
            slug: true,
            pricePerDay: true,
            thumbnailUrl: true,
            modelYear: true,
            brand: { select: { name: true } },
          },
        }),
      ]);

      return { models, brands, vehicles };
    });

    return data;
  },

  async getById(id) {
    const car = await prisma.vehicle.findUnique({
      where: { id: Number(id) },
      include: {
        brand: true,
        model: true,
        category: true,
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
    return prisma.vehicle.update({ where: { id: Number(id) }, data });
  },

  async delete(id) {
    return prisma.vehicle.delete({ where: { id: Number(id) } });
  },
};
