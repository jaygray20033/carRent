// src/api/v1/posts/post.routes.js
// Blog public read routes (UC-21/22/25/26/27).
// NOTE: static paths (/featured, /search) MUST be declared before the
// dynamic /:slug route, otherwise Express matches them as a slug.
import { Router } from 'express';
import { postController } from './post.controller.js';

const router = Router();

router.get('/', postController.list);
router.get('/featured', postController.featured);
router.get('/search', postController.search);
router.get('/:id/related', postController.related);
router.get('/:slug', postController.detail);

export default router;
