// src/routes/brands.routes.js
import { Router } from 'express';
import * as brandsCtrl from '../controllers/brands.controller.js';

const router = Router();

/**
 * @swagger
 * /brands:
 *   get:
 *     summary: List all brands
 *     tags: [Brands]
 *     responses:
 *       200:
 *         description: List of brands with vehicle/model count
 */
router.get('/', brandsCtrl.listBrands);

/**
 * @swagger
 * /brands/{id}:
 *   get:
 *     summary: Get brand detail with its vehicle models
 *     tags: [Brands]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Brand detail
 *       404:
 *         description: Brand not found
 */
router.get('/:id', brandsCtrl.getBrand);

/**
 * @swagger
 * /categories:
 *   get:
 *     summary: List all vehicle categories
 *     tags: [Brands]
 *     responses:
 *       200:
 *         description: List of categories with vehicle count
 */
// Categories are exposed from a separate route in index
export { brandsCtrl };

export default router;
