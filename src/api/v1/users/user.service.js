// src/api/v1/users/user.service.js
import prisma from '../../../config/db.js';
import { NotFoundError } from '../../../utils/apiError.js';

const sanitize = (u) => {
  if (!u) return null;
  const { passwordHash: _passwordHash, ...rest } = u;
  return rest;
};

export const userService = {
  async getById(id) {
    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
      include: { role: true },
    });
    if (!user) throw new NotFoundError('User');
    return sanitize(user);
  },

  async updateProfile(id, data) {
    const payload = { ...data };
    if (data.dateOfBirth) payload.dateOfBirth = new Date(data.dateOfBirth);

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: payload,
      include: { role: true },
    });
    return sanitize(user);
  },
};
