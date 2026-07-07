// src/api/v1/sos-requests/sosRequest.routes.js
// Day 39 (UC-34/35/36) — customer raises + polls roadside SOS requests.
import { Router } from 'express';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { uploadImages, handleUploadError } from '../../../middlewares/upload.middleware.js';
import { sosRequestController } from './sosRequest.controller.js';
import { idParamSchema, createSosSchema } from './sosRequest.validator.js';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /sos-requests:
 *   post:
 *     tags: [SOS]
 *     summary: Raise a roadside SOS for an in-use booking (UC-34) — optional photos
 *     responses:
 *       201: { description: SOS request created }
 *       409: { description: Booking not IN_USE or already has an open request }
 */
router.post(
  '/',
  uploadImages(6),
  handleUploadError,
  validate(createSosSchema, 'body'),
  sosRequestController.submit
);

/**
 * @swagger
 * /sos-requests:
 *   get:
 *     tags: [SOS]
 *     summary: List my SOS requests for a booking (UC-35 status polling)
 *     parameters:
 *       - in: query
 *         name: bookingId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: SOS requests for the booking }
 */
router.get('/', sosRequestController.listForBooking);

/**
 * @swagger
 * /sos-requests/{id}:
 *   get:
 *     tags: [SOS]
 *     summary: Get a single SOS request (owner or staff)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: SOS request detail }
 *       403: { description: Not the owner and not staff }
 *       404: { description: Not found }
 */
router.get('/:id', validate(idParamSchema, 'params'), sosRequestController.detail);

export default router;
