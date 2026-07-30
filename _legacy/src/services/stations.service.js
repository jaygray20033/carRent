// src/services/stations.service.js
import prisma from '../config/prisma.js';

/**
 * List all stations with optional filters
 */
export async function listStations({ city, type, isActive } = {}) {
  const where = {};
  if (city) where.city = { contains: city };
  if (type) where.type = type;
  if (isActive !== undefined) where.isActive = isActive === 'true' || isActive === true;

  return prisma.station.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { vehicles: true } },
    },
  });
}

/**
 * Get station by id
 */
export async function getStationById(id) {
  return prisma.station.findUnique({
    where: { id: Number(id) },
    include: {
      vehicles: {
        where: { status: 'AVAILABLE' },
        take: 10,
        include: {
          brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
          category: { select: { id: true, name: true, slug: true } },
        },
      },
      _count: { select: { vehicles: true } },
    },
  });
}
