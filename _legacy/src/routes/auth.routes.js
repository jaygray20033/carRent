// src/routes/auth.routes.js
import { Router } from 'express';
import * as authCtrl from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register new customer
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, phone, password]
 *             properties:
 *               fullName: { type: string }
 *               phone: { type: string }
 *               email: { type: string }
 *               password: { type: string, minLength: 6 }
 *     responses:
 *       201:
 *         description: User created
 *       409:
 *         description: Phone/email already exists
 */
router.post('/register', authCtrl.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with phone and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, password]
 *             properties:
 *               phone: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login success with tokens
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', authCtrl.login);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authenticate, authCtrl.getMe);

export default router;
