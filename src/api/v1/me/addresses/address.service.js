// src/api/v1/me/addresses/address.service.js
// Address book — UC-42 (CRUD), UC-43 (set default).
import prisma from '../../../../config/db.js';
import { NotFoundError } from '../../../../utils/apiError.js';

// Empty strings from the client → null for optional columns.
const clean = (v) => (v === '' ? null : v);

function normalize(data) {
  const out = {};
  for (const key of [
    'contactName',
    'contactPhone',
    'line',
    'ward',
    'district',
    'city',
    'postalCode',
    'latitude',
    'longitude',
  ]) {
    if (data[key] !== undefined) out[key] = clean(data[key]);
  }
  return out;
}

export const addressService = {
  // GET /me/addresses — default first, then newest.
  async list(userId) {
    return prisma.address.findMany({
      where: { userId: Number(userId) },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  },

  // POST /me/addresses
  async create(userId, data) {
    const uid = Number(userId);
    const count = await prisma.address.count({ where: { userId: uid } });
    // First address is default automatically; otherwise honour the flag.
    const makeDefault = count === 0 || data.isDefault === true;

    return prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({
          where: { userId: uid, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.address.create({
        data: { ...normalize(data), userId: uid, isDefault: makeDefault },
      });
    });
  },

  // PATCH /me/addresses/:id
  async update(userId, id, data) {
    const uid = Number(userId);
    const addressId = Number(id);
    const existing = await prisma.address.findFirst({
      where: { id: addressId, userId: uid },
    });
    if (!existing) throw new NotFoundError('Address');

    const wantsDefault = data.isDefault === true && !existing.isDefault;

    return prisma.$transaction(async (tx) => {
      if (wantsDefault) {
        await tx.address.updateMany({
          where: { userId: uid, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.address.update({
        where: { id: addressId },
        data: {
          ...normalize(data),
          ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        },
      });
    });
  },

  // PATCH /me/addresses/:id/default — atomic: clear all, set this one.
  async setDefault(userId, id) {
    const uid = Number(userId);
    const addressId = Number(id);
    const existing = await prisma.address.findFirst({
      where: { id: addressId, userId: uid },
    });
    if (!existing) throw new NotFoundError('Address');

    return prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId: uid, isDefault: true },
        data: { isDefault: false },
      });
      return tx.address.update({
        where: { id: addressId },
        data: { isDefault: true },
      });
    });
  },

  // DELETE /me/addresses/:id — if the default was removed, promote the newest.
  async remove(userId, id) {
    const uid = Number(userId);
    const addressId = Number(id);
    const existing = await prisma.address.findFirst({
      where: { id: addressId, userId: uid },
    });
    if (!existing) throw new NotFoundError('Address');

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: addressId } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId: uid },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });
    return { id: addressId };
  },
};
