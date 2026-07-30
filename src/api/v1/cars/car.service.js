// src/api/v1/cars/car.service.js
import prisma from '../../../config/db.js';
import { NotFoundError } from '../../../utils/apiError.js';
import { buildCacheKey, cached } from '../../../utils/cache.js';
import { settingsService } from '../../../services/settingsService.js';
import { BOOKING_STATUS } from '../../../config/constants.js';

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

/**
 * Build the rate card returned in the car detail response.
 * Shape: { daily, hourly, with_driver_daily, monthly, currency }
 *
 * The hourly ratio and with-driver surcharge come from SiteSetting (pricing
 * group) via settingsService — no longer hardcoded (Day 35, UC-60).
 */
const buildRates = (car, pricing) => ({
  daily: car.pricePerDay,
  hourly: Math.round((car.pricePerDay * pricing.hourlyRateRatio) / 1000) * 1000,
  with_driver_daily:
    Math.round((car.pricePerDay * (1 + pricing.withDriverSurcharge)) / 1000) * 1000,
  monthly: car.pricePerMonth ?? null,
  currency: 'VND',
});

/**
 * Aggregate rating (avg + count) from the Review table for one vehicle.
 * T6 note: real reviews are seeded later. For now this returns the live
 * aggregate when reviews exist, otherwise a placeholder of { avg: 0, count: 0 }.
 */
const getRatingAggregate = async (vehicleId) => {
  const agg = await prisma.review.aggregate({
    where: { vehicleId: Number(vehicleId) },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const count = agg._count?._all ?? 0;
  const avg = count > 0 ? Number((agg._avg.rating ?? 0).toFixed(1)) : 0;
  return { avg, count };
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

  /**
   * GET /cars/:slug — vehicle detail.
   * Returns Vehicle + Model + Brand + Station + Category + Images, the deposit,
   * a derived rate card (daily / hourly / with_driver_daily), and an aggregated
   * rating (avg + count) computed from the Review table (placeholder 0 until T6).
   */
  async getBySlug(slug) {
    const car = await prisma.vehicle.findUnique({
      where: { slug: String(slug) },
      include: {
        brand: true,
        model: true,
        category: true,
        station: true,
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!car) throw new NotFoundError('Vehicle');

    const [rating, pricing] = await Promise.all([
      getRatingAggregate(car.id),
      settingsService.getPricingConfig(),
    ]);

    return {
      ...car,
      thumbnailUrl: car.thumbnailUrl || car.images?.[0]?.url || null,
      vehicleModel: car.model || null,
      deposit: car.depositAmount ?? pricing.depositDefault,
      rates: buildRates(car, pricing),
      rating: rating.avg, // numeric avg from reviews (0 when none)
      reviewCount: rating.count, // live count, consistent with the list endpoint
    };
  },

  /**
   * GET /cars/:id/similar — vehicles sharing the same category_id OR brand_id,
   * excluding the reference vehicle itself. Only AVAILABLE cars, limit 4,
   * ordered by popularity then rating.
   */
  async getSimilar(id, limit = 4) {
    const refId = Number(id);
    const ref = await prisma.vehicle.findUnique({
      where: { id: refId },
      select: { id: true, categoryId: true, brandId: true },
    });
    if (!ref) throw new NotFoundError('Vehicle');

    const orConditions = [];
    if (ref.categoryId != null) orConditions.push({ categoryId: ref.categoryId });
    if (ref.brandId != null) orConditions.push({ brandId: ref.brandId });

    const where = {
      status: 'AVAILABLE',
      id: { not: refId },
      ...(orConditions.length ? { OR: orConditions } : {}),
    };

    const rows = await prisma.vehicle.findMany({
      where,
      take: limit,
      orderBy: [{ totalBookings: 'desc' }, { rating: 'desc' }, { reviewCount: 'desc' }],
      include: listInclude,
    });

    return rows.map((v) => ({
      ...v,
      thumbnailUrl: v.thumbnailUrl || v.images?.[0]?.url || null,
      minPrice: v.pricePerDay,
      vehicleModel: v.model || null,
    }));
  },

  /**
   * GET /cars/:id/availability?from=&to= — Day 10.
   * Returns the booked periods that still occupy the vehicle, so the FE date
   * picker can grey out unavailable days. Active statuses are CONFIRMED,
   * IN_USE, PENDING_PAYMENT and DRAFT — but DRAFT/PENDING_PAYMENT only count
   * while their Redis hold has not expired (holdUntil in the future).
   */
  async getAvailability(id, { from, to } = {}) {
    const vehicleId = Number(id);
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundError('Vehicle');

    const now = new Date();
    const where = {
      vehicleId,
      // CONFIRMED / IN_USE always occupy the slot; DRAFT / PENDING_PAYMENT only
      // while their Redis hold has not expired (holdUntil in the future).
      OR: [
        { status: { in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_USE] } },
        {
          status: { in: [BOOKING_STATUS.PENDING_PAYMENT, BOOKING_STATUS.DRAFT] },
          holdUntil: { gt: now },
        },
      ],
    };

    // Optional window filter: keep bookings that overlap [from, to).
    if (from || to) {
      where.AND = [];
      if (to) where.AND.push({ pickupAt: { lt: new Date(to) } });
      if (from) where.AND.push({ returnAt: { gt: new Date(from) } });
    }

    const rows = await prisma.booking.findMany({
      where,
      orderBy: { pickupAt: 'asc' },
      select: { pickupAt: true, returnAt: true, status: true },
    });

    return rows.map((b) => ({
      from: b.pickupAt,
      to: b.returnAt,
      status: b.status,
    }));
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
