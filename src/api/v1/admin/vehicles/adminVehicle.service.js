// src/api/v1/admin/vehicles/adminVehicle.service.js
import prisma from '../../../../config/db.js';
import { NotFoundError, ConflictError } from '../../../../utils/apiError.js';
import storage from '../../../../integrations/storage.js';

const detailInclude = {
  brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
  category: { select: { id: true, name: true, slug: true } },
  model: { select: { id: true, name: true, slug: true } },
  station: { select: { id: true, name: true, city: true } },
  images: { orderBy: { sortOrder: 'asc' } },
};

const buildOrderBy = (sort) => {
  switch (sort) {
    case 'price_asc':
      return [{ pricePerDay: 'asc' }];
    case 'price_desc':
      return [{ pricePerDay: 'desc' }];
    case 'rating':
      return [{ rating: 'desc' }, { reviewCount: 'desc' }];
    case 'popular':
      return [{ totalBookings: 'desc' }];
    case 'newest':
    default:
      return [{ createdAt: 'desc' }];
  }
};

export const adminVehicleService = {
  /**
   * Admin list — includes vehicles in ANY status (not only AVAILABLE).
   */
  async list(query) {
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const limit = Number(query.limit) > 0 ? Math.min(Number(query.limit), 100) : 20;
    const skip = (page - 1) * limit;

    const where = {};
    if (query.status) where.status = query.status; // otherwise: all statuses
    if (query.brandId) where.brandId = query.brandId;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.stationId) where.stationId = query.stationId;

    if (query.q && query.q.trim()) {
      const term = query.q.trim();
      where.OR = [
        { name: { contains: term } },
        { licensePlate: { contains: term } },
        { slug: { contains: term } },
        { brand: { name: { contains: term } } },
        { model: { name: { contains: term } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.vehicle.count({ where }),
      prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: buildOrderBy(query.sort),
        include: detailInclude,
      }),
    ]);

    return { items, total, page, limit };
  },

  async getById(id) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: Number(id) },
      include: detailInclude,
    });
    if (!vehicle) throw new NotFoundError('Vehicle');
    return vehicle;
  },

  async create(data) {
    const { images, ...vehicleData } = data;

    // Guard unique constraints with a friendly 409.
    await this._assertUnique(vehicleData.slug, vehicleData.licensePlate);

    const created = await prisma.vehicle.create({
      data: {
        ...vehicleData,
        images: images?.length
          ? {
              create: images.map((img, i) => ({
                url: img.url,
                isPrimary: img.isPrimary ?? i === 0,
                sortOrder: img.sortOrder ?? i,
              })),
            }
          : undefined,
        // First image becomes the thumbnail if none provided.
        thumbnailUrl: vehicleData.thumbnailUrl || images?.[0]?.url || undefined,
      },
      include: detailInclude,
    });
    return created;
  },

  async update(id, data) {
    const existing = await prisma.vehicle.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Vehicle');

    const { images, ...vehicleData } = data;
    await this._assertUnique(vehicleData.slug, vehicleData.licensePlate, Number(id));

    // If a new image set is provided, replace existing images.
    let imagesOp;
    if (Array.isArray(images)) {
      imagesOp = {
        deleteMany: {},
        create: images.map((img, i) => ({
          url: img.url,
          isPrimary: img.isPrimary ?? i === 0,
          sortOrder: img.sortOrder ?? i,
        })),
      };
    }

    return prisma.vehicle.update({
      where: { id: Number(id) },
      data: { ...vehicleData, ...(imagesOp ? { images: imagesOp } : {}) },
      include: detailInclude,
    });
  },

  /**
   * Soft delete → status = RETIRED (keeps history & bookings intact).
   */
  async softDelete(id) {
    const existing = await prisma.vehicle.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Vehicle');
    return prisma.vehicle.update({
      where: { id: Number(id) },
      data: { status: 'RETIRED' },
      include: detailInclude,
    });
  },

  /**
   * Attach uploaded images (already pushed to storage) to a vehicle.
   * Enforces a max of 10 images per vehicle.
   * @param {number} id
   * @param {Array<{url:string,key:string}>} uploaded
   */
  async addImages(id, uploaded) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: Number(id) },
      include: { images: true },
    });
    if (!vehicle) throw new NotFoundError('Vehicle');

    const existingCount = vehicle.images.length;
    if (existingCount + uploaded.length > 10) {
      throw new ConflictError(
        `Max 10 images per vehicle (currently ${existingCount}, adding ${uploaded.length})`,
        'IMAGE_LIMIT'
      );
    }

    const startOrder = existingCount;
    const hasPrimary = vehicle.images.some((img) => img.isPrimary);

    await prisma.vehicleImage.createMany({
      data: uploaded.map((u, i) => ({
        vehicleId: vehicle.id,
        url: u.url,
        isPrimary: !hasPrimary && i === 0,
        sortOrder: startOrder + i,
      })),
    });

    // Set thumbnail from first uploaded image if none yet.
    if (!vehicle.thumbnailUrl && uploaded[0]?.url) {
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { thumbnailUrl: uploaded[0].url },
      });
    }

    return this.getById(vehicle.id);
  },

  /**
   * Quick-action status change (UC-53). Only AVAILABLE | MAINTENANCE | RETIRED
   * are valid here — RENTED is driven by the booking lifecycle, not by admins.
   */
  async updateStatus(id, status) {
    const existing = await prisma.vehicle.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Vehicle');
    return prisma.vehicle.update({
      where: { id: Number(id) },
      data: { status },
      include: detailInclude,
    });
  },

  /**
   * Booking history for a single vehicle (UC-53), newest first, paginated.
   */
  async listBookings(id, query) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: Number(id) } });
    if (!vehicle) throw new NotFoundError('Vehicle');

    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const limit = Number(query.limit) > 0 ? Math.min(Number(query.limit), 100) : 20;
    const skip = (page - 1) * limit;

    const where = { vehicleId: Number(id) };
    if (query.status) where.status = query.status;

    const [total, items] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, phone: true, email: true } },
          pickupStation: { select: { id: true, name: true, city: true } },
          dropoffStation: { select: { id: true, name: true, city: true } },
        },
      }),
    ]);

    return { items, total, page, limit };
  },

  async _assertUnique(slug, licensePlate, excludeId = null) {
    if (!slug && !licensePlate) return;
    const or = [];
    if (slug) or.push({ slug });
    if (licensePlate) or.push({ licensePlate });
    const clash = await prisma.vehicle.findFirst({
      where: {
        OR: or,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true, slug: true, licensePlate: true },
    });
    if (clash) {
      const field = clash.slug === slug ? 'slug' : 'licensePlate';
      throw new ConflictError(`Vehicle ${field} already exists`, 'DUPLICATE');
    }
  },

  storage,
};
