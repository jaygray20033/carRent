// src/services/brands.service.js
import prisma from '../config/prisma.js';

/**
 * List all brands
 */
export async function listBrands() {
  return prisma.brand.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { vehicles: true, models: true } },
    },
  });
}

/**
 * Get brand by id with its models
 */
export async function getBrandById(id) {
  return prisma.brand.findUnique({
    where: { id: Number(id) },
    include: {
      models: {
        orderBy: { name: 'asc' },
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      },
      _count: { select: { vehicles: true } },
    },
  });
}

/**
 * List categories
 */
export async function listCategories() {
  return prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { vehicles: true } },
    },
  });
}
