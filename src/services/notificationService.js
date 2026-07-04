// src/services/notificationService.js
// UC-51 — in-app notifications. `notify()` persists a row after a user-visible
// event (booking confirmed/cancelled, comment approved, SOS resolved, promo);
// the feed methods back the notification centre + header bell.
import prisma from '../config/db.js';
import { NotFoundError, ForbiddenError } from '../utils/apiError.js';

export const notificationService = {
  /**
   * Create a notification row. Never throws into the caller's happy path — a
   * failed notification must not roll back the business action that triggered it.
   */
  async notify({ userId, type, title, body = null, link = null }) {
    try {
      return await prisma.notification.create({
        data: { userId, type, title, body, link },
      });
    } catch {
      return null;
    }
  },

  /**
   * GET /me/notifications — paginated feed, newest first. When `unread` is set
   * only unread rows are returned. Always includes the total unread count so the
   * header bell badge can update from the same response.
   */
  async list(userId, { unread = false, page = 1, limit = 20 } = {}) {
    const where = { userId, ...(unread ? { isRead: false } : {}) };
    const skip = (page - 1) * limit;

    const [total, items, unreadCount] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { items, total, page, limit, unreadCount };
  },

  /** PATCH /me/notifications/:id/read — mark one notification read (owner only). */
  async markRead(userId, id) {
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundError('Notification');
    if (notification.userId !== userId) throw new ForbiddenError('Not your notification');
    if (notification.isRead) return notification;
    return prisma.notification.update({ where: { id }, data: { isRead: true } });
  },

  /** PATCH /me/notifications/read-all — mark all of the user's unread read. */
  async markAllRead(userId) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  },
};

export default notificationService;
