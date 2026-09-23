// src/api/v1/notifications/notification.controller.js
// UC-51 — in-app notification feed for the signed-in user.
import { notificationService } from '../../../services/notificationService.js';
import { ValidationError } from '../../../utils/apiError.js';
import { success } from '../../../utils/apiResponse.js';

const parseId = (raw) => {
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id)) throw new ValidationError([{ field: 'id', message: 'Invalid id' }]);
  return id;
};

export const notificationController = {
  // GET /me/notifications?unread=true&page=&limit=
  list: async (req, res) => {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const unread = req.query.unread === 'true' || req.query.unread === '1';

    const result = await notificationService.list(req.user.id, { unread, page, limit });
    return success(res, result);
  },

  // PATCH /me/notifications/:id/read
  markRead: async (req, res) => {
    const id = parseId(req.params.id);
    const notification = await notificationService.markRead(req.user.id, id);
    return success(res, { notification }, 'Marked as read');
  },

  // PATCH /me/notifications/read-all
  readAll: async (req, res) => {
    const count = await notificationService.markAllRead(req.user.id);
    return success(res, { updated: count }, 'All notifications marked as read');
  },
};

export default notificationController;
