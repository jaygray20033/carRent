// src/services/notificationService.js
// UC-51 placeholder — persist an in-app notification for a user. Kept tiny on
// purpose: the full notification centre (read/unread feeds, push, prefs) lands
// in Tuần 6. For now other modules call `notify()` after a user-visible event
// (e.g. a blog comment being approved) so the record exists when UC-51 ships.
import prisma from '../config/db.js';

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
};

export default notificationService;
