// src/api/v1/admin/vehicle-models/adminVehicleModel.service.js
import prisma from '../../../../config/db.js';
import { NotFoundError, ConflictError } from '../../../../utils/apiError.js';

const include = {
  brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
  category: { select: { id: true, name: true, slug: true } },
  _count: { select: { vehicles: true } },
};

export const adminVehicleModelService = {
  async list(query) {
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const limit =
      Number(query.limit || query.size) > 0 ? Math.min(Number(query.limit || query.size), 100) : 20;
    const skip = (page - 1) * limit;

    const where = {};
    if (query.brandId) where.brandId = query.brandId;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.q && query.q.trim()) {
      const term = query.q.trim();
      where.OR = [
        { name: { contains: term } },
        { slug: { contains: term } },
        { brand: { name: { contains: term } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.vehicleModel.count({ where }),
      prisma.vehicleModel.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ name: 'asc' }],
        include,
      }),
    ]);

    return { items, total, page, limit };
  },

  async getById(id) {
    const model = await prisma.vehicleModel.findUnique({
      where: { id: Number(id) },
      include,
    });
    if (!model) throw new NotFoundError('VehicleModel');
    return model;
  },

  async create(data) {
    await this._assertSlugUnique(data.slug);
    return prisma.vehicleModel.create({ data, include });
  },

  async update(id, data) {
    const existing = await prisma.vehicleModel.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('VehicleModel');
    if (data.slug) await this._assertSlugUnique(data.slug, Number(id));
    return prisma.vehicleModel.update({ where: { id: Number(id) }, data, include });
  },

  /**
   * Hard delete a model. Blocked when vehicles still reference it.
   */
  async remove(id) {
    const model = await prisma.vehicleModel.findUnique({
      where: { id: Number(id) },
      include: { _count: { select: { vehicles: true } } },
    });
    if (!model) throw new NotFoundError('VehicleModel');
    if (model._count.vehicles > 0) {
      throw new ConflictError(
        `Cannot delete: ${model._count.vehicles} vehicle(s) still use this model`,
        'MODEL_IN_USE'
      );
    }
    await prisma.vehicleModel.delete({ where: { id: Number(id) } });
    return { id: Number(id) };
  },

  async _assertSlugUnique(slug, excludeId = null) {
    const clash = await prisma.vehicleModel.findFirst({
      where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictError('VehicleModel slug already exists', 'DUPLICATE');
  },
};
