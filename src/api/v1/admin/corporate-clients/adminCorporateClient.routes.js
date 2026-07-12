// src/api/v1/admin/corporate-clients/adminCorporateClient.routes.js
// B2B Day 2 UC-61 — OtoRent Admin CRUD for Corporate Clients.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { corporateController } from '../../corporate/corporate.controller.js';
import {
  createCorporateClientSchema,
  updateCorporateClientSchema,
  listCorporateClientsQuerySchema,
  idParamSchema,
  priceConfigSchema,
} from '../../corporate/corporateClient.validator.js';
import {
  createSettlementSchema,
  listSettlementsQuerySchema,
  dashboardQuerySchema,
} from '../../corporate/settlement.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

/**
 * @swagger
 * tags:
 *   - name: Admin - Corporate
 *     description: B2B corporate clients (UC-61)
 */
router.get(
  '/',
  validate(listCorporateClientsQuerySchema, 'query'),
  corporateController.listClients
);
router.post('/', validate(createCorporateClientSchema, 'body'), corporateController.createClient);
router.get('/:id', validate(idParamSchema, 'params'), corporateController.getClient);
router.put(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateCorporateClientSchema, 'body'),
  corporateController.updateClient
);
router.delete('/:id', validate(idParamSchema, 'params'), corporateController.deleteClient);
router.get(
  '/:id/price-config',
  validate(idParamSchema, 'params'),
  corporateController.getPriceConfig
);
router.put(
  '/:id/price-config',
  validate(idParamSchema, 'params'),
  validate(priceConfigSchema, 'body'),
  corporateController.updatePriceConfig
);

// Day 5 — settlements under a client
router.post(
  '/:id/settlements',
  validate(idParamSchema, 'params'),
  validate(createSettlementSchema, 'body'),
  corporateController.createSettlement
);
router.get(
  '/:id/settlements',
  validate(idParamSchema, 'params'),
  validate(listSettlementsQuerySchema, 'query'),
  corporateController.listSettlementsAdmin
);

// Day 6 — admin view of company dashboard
router.get(
  '/:id/dashboard',
  validate(idParamSchema, 'params'),
  validate(dashboardQuerySchema, 'query'),
  corporateController.adminCompanyDashboard
);

export default router;
