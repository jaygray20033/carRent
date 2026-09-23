// src/api/v1/brands/brand.routes.js
import { Router } from 'express';
import prisma from '../../../config/db.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success } from '../../../utils/apiResponse.js';

const router = Router();

/**
 * @swagger
 * /brands:
 *   get:
 *     tags: [Catalog]
 *     summary: List all car brands (with vehicle counts)
 *     responses:
 *       200: { description: All brands }
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const brands = await prisma.brand.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { vehicles: true } },
      },
    });
    // Revalidate every request (brands change on admin edits / test cleanup);
    // paired with Express's ETag so unchanged lists still return a cheap 304.
    res.set('Cache-Control', 'no-cache');
    return success(res, { brands });
  })
);

export default router;
