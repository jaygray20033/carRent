// src/api/v1/admin/settings/adminSettings.routes.js
// Day 35 (UC-60) — admin settings. ADMIN only.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminSettingsController } from './adminSettings.controller.js';
import { updateSettingsSchema } from './adminSettings.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN']));

/**
 * @swagger
 * /admin/settings:
 *   get:
 *     tags: [Admin - Settings]
 *     summary: Read all site settings (UC-60)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Settings map keyed by setting key }
 *   put:
 *     tags: [Admin - Settings]
 *     summary: Update site settings (UC-60) — upserts key/value pairs, invalidates cache
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [settings]
 *             properties:
 *               settings:
 *                 type: object
 *                 additionalProperties: true
 *                 example: { site_hotline: "0900000000", tax_rate: 10 }
 *     responses:
 *       200: { description: Updated settings map }
 *       422: { description: Validation failed }
 */
router.get('/', adminSettingsController.getAll);
router.put('/', validate(updateSettingsSchema, 'body'), adminSettingsController.update);

export default router;
