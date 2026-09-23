// User submits a supplier (nhà xe) application + views status. Mounted at '/'.
import { Router } from 'express';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { uploadImage, handleUploadError } from '../../../middlewares/upload.middleware.js';
import { supplierApplicationController } from './supplierApplication.controller.js';
import { createSupplierApplicationSchema } from './supplierApplication.validator.js';

const router = Router();

router.post(
  '/supplier-applications',
  authenticate,
  uploadImage,
  handleUploadError,
  validate(createSupplierApplicationSchema, 'body'),
  supplierApplicationController.submit
);

router.get('/me/supplier-application', authenticate, supplierApplicationController.mine);

export default router;
