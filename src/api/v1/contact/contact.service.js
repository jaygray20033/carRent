// src/api/v1/contact/contact.service.js
// Day 36 (UC-28/29/30) — contact messages.
//   create — public form submission (rate limited at the route)
//   list   — admin, filter by status
//   update — admin, set status + reply note
import prisma from '../../../config/db.js';
import { NotFoundError } from '../../../utils/apiError.js';

const STATUSES = ['NEW', 'READ', 'REPLIED'];

export const contactService = {
  /** Public — store a submitted contact message. */
  async create(data, ipAddress) {
    return prisma.contactMessage.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        subject: data.subject || null,
        message: data.message,
        ipAddress: ipAddress || null,
      },
    });
  },

  /** Admin — list, newest first, optional status filter. */
  async list({ status, page = 1, size = 20 }) {
    const where = {};
    if (status && STATUSES.includes(status)) where.status = status;

    const [items, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.contactMessage.count({ where }),
    ]);
    return { items, total, page, size };
  },

  /** Admin — set status (READ | REPLIED) and optional reply note. */
  async update(id, { status, replyNote }) {
    const existing = await prisma.contactMessage.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Contact message');

    const patch = {};
    if (status !== undefined) patch.status = status;
    if (replyNote !== undefined) patch.replyNote = replyNote || null;

    return prisma.contactMessage.update({ where: { id: Number(id) }, data: patch });
  },
};

export default contactService;
