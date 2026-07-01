// src/api/v1/posts/post.routes.js
// Blog public read routes (UC-21/22/25/26/27).
// NOTE: static paths (/featured, /search) MUST be declared before the
// dynamic /:slug route, otherwise Express matches them as a slug.
import { Router } from 'express';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { postController } from './post.controller.js';
import { commentController } from './comment.controller.js';
import { postIdParamSchema, createCommentSchema } from './comment.validator.js';

const router = Router();

router.get('/', postController.list);
router.get('/categories', postController.categories);
router.get('/featured', postController.featured);
router.get('/search', postController.search);
router.get('/:id/related', postController.related);

// Comments (UC-24). Declared before /:slug so the /:id/comments paths win.
router.get(
  '/:id/comments/mine',
  authenticate,
  validate(postIdParamSchema, 'params'),
  commentController.mine
);
router.get(
  '/:id/comments',
  validate(postIdParamSchema, 'params'),
  commentController.list
);
router.post(
  '/:id/comments',
  authenticate,
  validate(postIdParamSchema, 'params'),
  validate(createCommentSchema, 'body'),
  commentController.create
);

router.get('/:slug', postController.detail);

export default router;
