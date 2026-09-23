// src/api/v1/agent-applications/agentApplication.routes.js
// Day 38 (UC-32/33) — user submits an agent (car owner) application + views status.
// Owns both /agent-applications (POST) and /me/agent-application (GET); mounted at '/'.
import { Router } from 'express';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { uploadImage, handleUploadError } from '../../../middlewares/upload.middleware.js';
import { agentApplicationController } from './agentApplication.controller.js';
import { createApplicationSchema } from './agentApplication.validator.js';

const router = Router();

/**
 * @swagger
 * /agent-applications:
 *   post:
 *     tags: [Agent]
 *     summary: Submit an agent (car owner) application (UC-32) — optional KYC file
 *     responses:
 *       201: { description: Application submitted }
 *       409: { description: A pending application already exists }
 */
router.post(
  '/agent-applications',
  authenticate,
  uploadImage,
  handleUploadError,
  validate(createApplicationSchema, 'body'),
  agentApplicationController.submit
);

/**
 * @swagger
 * /me/agent-application:
 *   get:
 *     tags: [Agent]
 *     summary: View my latest agent application status (UC-33)
 *     responses:
 *       200: { description: Latest application or null }
 */
router.get('/me/agent-application', authenticate, agentApplicationController.mine);

export default router;
