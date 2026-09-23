// src/api/v1/admin/rescue-stations/adminRescueStation.service.js
// Day 37 (UC-31) — admin rescue station CRUD.
import prisma from '../../../../config/db.js';
import { NotFoundError } from '../../../../utils/apiError.js';

export const adminRescueStationService = {
  /** Admin list — filter by q (name/city/address) / isActive, newest first. */
  async list({ q, isActive, page = 1, size = 20 }) {
    const where = {};
    if (q && q.trim()) {
      where.OR = [
        { name: { contains: q.trim() } },
        { city: { contains: q.trim() } },
        { address: { contains: q.trim() } },
      ];
    }
    if (isActive !== undefined) where.isActive = isActive;

    const [items, total] = await Promise.all([
      prisma.rescueStation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.rescueStation.count({ where }),
    ]);
    return { items, total, page, size };
  },

  async getById(id) {
    const station = await prisma.rescueStation.findUnique({ where: { id: Number(id) } });
    if (!station) throw new NotFoundError('Rescue station');
    return station;
  },

  async create(data) {
    return prisma.rescueStation.create({ data });
  },

  async update(id, data) {
    const existing = await prisma.rescueStation.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Rescue station');
    return prisma.rescueStation.update({ where: { id: Number(id) }, data });
  },

  async remove(id) {
    const existing = await prisma.rescueStation.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Rescue station');
    await prisma.rescueStation.delete({ where: { id: Number(id) } });
    return { id: Number(id) };
  },
};

export default adminRescueStationService;
