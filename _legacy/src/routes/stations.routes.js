// src/routes/stations.routes.js
import { Router } from 'express';
import * as stationsCtrl from '../controllers/stations.controller.js';

const router = Router();

/**
 * @swagger
 * /stations:
 *   get:
 *     summary: List all stations
 *     tags: [Stations]
 *     parameters:
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [AIRPORT, CITY, HQ] }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: List of stations
 */
router.get('/', stationsCtrl.listStations);

/**
 * @swagger
 * /stations/{id}:
 *   get:
 *     summary: Get station detail with available vehicles
 *     tags: [Stations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Station detail
 *       404:
 *         description: Station not found
 */
router.get('/:id', stationsCtrl.getStation);

export default router;
