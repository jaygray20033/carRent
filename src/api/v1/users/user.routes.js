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

// UC-50 — my reviews + bookings still awaiting a review
router.get('/reviews', asyncHandler(reviewController.listMine));
router.get('/reviews/reviewable', asyncHandler(reviewController.reviewable));

// UC-51 — notification feed
router.get('/notifications', asyncHandler(notificationController.list));
router.patch('/notifications/read-all', asyncHandler(notificationController.readAll));
router.patch('/notifications/:id/read', asyncHandler(notificationController.markRead));

// UC-37 / UC-38 — profile read + update
router.get('/', asyncHandler(userController.me));
router.patch('/', validate(updateProfileSchema), asyncHandler(userController.updateMe));

// UC-39 — avatar upload (multipart field "image")
router.post('/avatar', uploadImage, handleUploadError, asyncHandler(userController.uploadAvatar));

// UC-40 — change password (revokes all sessions)
router.post(
  '/change-password',
  validate(changePasswordSchema),
  asyncHandler(userController.changePassword)
);

// UC-41 — change phone (2-step OTP to the new number)
router.post(
  '/change-phone',
  validate(requestPhoneChangeSchema),
  asyncHandler(userController.requestPhoneChange)
);
router.post(
  '/change-phone/verify',
  validate(verifyPhoneChangeSchema),
  asyncHandler(userController.verifyPhoneChange)
);

export default router;
