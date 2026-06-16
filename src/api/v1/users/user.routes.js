// src/api/v1/users/user.routes.js
import { Router } from 'express';
import { userController } from './user.controller.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { updateProfileSchema } from './user.validator.js';

const router = Router();

router.use(authenticate);
router.get('/me', asyncHandler(userController.me));
router.put('/me', validate(updateProfileSchema), asyncHandler(userController.updateMe));

export default router;
