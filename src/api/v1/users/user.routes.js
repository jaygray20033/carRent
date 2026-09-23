// src/api/v1/users/user.routes.js
// Mounted at /me (see api/v1/index.js). Wallet lives at /me/wallet separately.
import { Router } from 'express';
import { userController } from './user.controller.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { uploadImage, handleUploadError } from '../../../middlewares/upload.middleware.js';
import {
  updateProfileSchema,
  changePasswordSchema,
  requestPhoneChangeSchema,
  verifyPhoneChangeSchema,
} from './user.validator.js';
import { reviewController } from '../reviews/review.controller.js';
import { notificationController } from '../notifications/notification.controller.js';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /me/reviews:
 *   get:
 *     tags: [Me]
 *     summary: My reviews (UC-50)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: My reviews }
 */
// UC-50 — my reviews + bookings still awaiting a review
router.get('/reviews', asyncHandler(reviewController.listMine));
/**
 * @swagger
 * /me/reviews/reviewable:
 *   get:
 *     tags: [Me]
 *     summary: Bookings awaiting a review (UC-50)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Reviewable bookings }
 */
router.get('/reviews/reviewable', asyncHandler(reviewController.reviewable));

/**
 * @swagger
 * /me/notifications:
 *   get:
 *     tags: [Me]
 *     summary: Notification feed (UC-51)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Notifications }
 */
// UC-51 — notification feed
router.get('/notifications', asyncHandler(notificationController.list));
/**
 * @swagger
 * /me/notifications/read-all:
 *   patch:
 *     tags: [Me]
 *     summary: Mark all notifications as read (UC-51)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All marked read }
 */
router.patch('/notifications/read-all', asyncHandler(notificationController.readAll));
/**
 * @swagger
 * /me/notifications/{id}/read:
 *   patch:
 *     tags: [Me]
 *     summary: Mark one notification as read (UC-51)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Marked read }
 */
router.patch('/notifications/:id/read', asyncHandler(notificationController.markRead));

/**
 * @swagger
 * /me:
 *   get:
 *     tags: [Me]
 *     summary: Get my profile (UC-37)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: My profile }
 *   patch:
 *     tags: [Me]
 *     summary: Update my profile (UC-38)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profile updated }
 */
// UC-37 / UC-38 — profile read + update
router.get('/', asyncHandler(userController.me));
router.patch('/', validate(updateProfileSchema), asyncHandler(userController.updateMe));

/**
 * @swagger
 * /me/avatar:
 *   post:
 *     tags: [Me]
 *     summary: Upload avatar (UC-39) — multipart field "image"
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Avatar updated }
 */
// UC-39 — avatar upload (multipart field "image")
router.post('/avatar', uploadImage, handleUploadError, asyncHandler(userController.uploadAvatar));

/**
 * @swagger
 * /me/change-password:
 *   post:
 *     tags: [Me]
 *     summary: Change password (UC-40) — revokes all sessions
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Password changed }
 */
// UC-40 — change password (revokes all sessions)
router.post(
  '/change-password',
  validate(changePasswordSchema),
  asyncHandler(userController.changePassword)
);

/**
 * @swagger
 * /me/change-phone:
 *   post:
 *     tags: [Me]
 *     summary: Request phone change (UC-41) — sends OTP to the new number
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OTP sent }
 */
// UC-41 — change phone (2-step OTP to the new number)
router.post(
  '/change-phone',
  validate(requestPhoneChangeSchema),
  asyncHandler(userController.requestPhoneChange)
);
/**
 * @swagger
 * /me/change-phone/verify:
 *   post:
 *     tags: [Me]
 *     summary: Verify phone change OTP (UC-41)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Phone changed }
 */
router.post(
  '/change-phone/verify',
  validate(verifyPhoneChangeSchema),
  asyncHandler(userController.verifyPhoneChange)
);

export default router;
