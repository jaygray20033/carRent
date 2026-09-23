// src/api/v1/contact/contact.routes.js
// Day 36 (UC-28/29/30) — public contact form + public contact settings.
import { Router } from 'express';
import { validate } from '../../../middlewares/validate.middleware.js';
import { rateLimit } from '../../../middlewares/rateLimit.middleware.js';
import { publicCache } from '../../../middlewares/cacheControl.middleware.js';
import { contactController } from './contact.controller.js';
import { createContactSchema } from './contact.validator.js';

const router = Router();

/**
 * @swagger
 * /contact-messages:
 *   post:
 *     tags: [Contact]
 *     summary: Submit a contact message (UC-28) — rate limited 5/h per IP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, message]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               subject: { type: string }
 *               message: { type: string }
 *     responses:
 *       201: { description: Message received }
 *       422: { description: Validation failed }
 *       429: { description: Too many requests }
 */
router.post(
  '/contact-messages',
  rateLimit({
    max: 5,
    windowSec: 3600,
    keyPrefix: 'contact',
    message: 'Bạn đã gửi quá nhiều liên hệ. Vui lòng thử lại sau một giờ.',
  }),
  validate(createContactSchema, 'body'),
  contactController.submit
);

/**
 * @swagger
 * /site-settings/contact:
 *   get:
 *     tags: [Contact]
 *     summary: Public contact info (UC-30) — hotline, email, address, socials
 *     responses:
 *       200: { description: Contact info }
 */
// Contact info changes rarely — cache aggressively (10 min shared / 5 min browser).
router.get(
  '/site-settings/contact',
  publicCache({ maxAge: 300, sMaxAge: 600 }),
  contactController.publicContact
);

export default router;
