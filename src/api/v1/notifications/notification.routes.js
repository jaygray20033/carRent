// src/api/v1/notifications/notification.routes.js
// Mounted at /me/notifications (see api/v1/index.js). All routes require auth.
import { Router } from 'express';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { notificationController } from './notification.controller.js';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /me/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List the current user's notifications (UC-51)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema: { type: boolean }
 *         description: When true, only unread notifications are returned
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: "Feed + unreadCount for the header bell badge" }
 */
router.get('/', asyncHandler(notificationController.list));

/**
 * @swagger
 * /me/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all of the user's notifications read (UC-51)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All notifications marked read }
 */
router.patch('/read-all', asyncHandler(notificationController.readAll));

/**
 * @swagger
 * /me/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark one notification read (UC-51)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Notification marked read }
 *       403: { description: Not your notification }
 *       404: { description: Notification not found }
 */
router.patch('/:id/read', asyncHandler(notificationController.markRead));

export default router;
