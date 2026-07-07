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

/**
 * @swagger
 * /posts:
 *   get:
 *     tags: [Blog]
 *     summary: List published blog posts (UC-21) — filter/paginate
 *     responses:
 *       200: { description: Posts }
 */
router.get('/', postController.list);
/**
 * @swagger
 * /posts/categories:
 *   get:
 *     tags: [Blog]
 *     summary: List blog categories
 *     responses:
 *       200: { description: Categories }
 */
router.get('/categories', postController.categories);
/**
 * @swagger
 * /posts/featured:
 *   get:
 *     tags: [Blog]
 *     summary: Featured posts (UC-22)
 *     responses:
 *       200: { description: Featured posts }
 */
router.get('/featured', postController.featured);
/**
 * @swagger
 * /posts/search:
 *   get:
 *     tags: [Blog]
 *     summary: Search posts (UC-26)
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200: { description: Search results }
 */
router.get('/search', postController.search);
/**
 * @swagger
 * /posts/{id}/related:
 *   get:
 *     tags: [Blog]
 *     summary: Related posts (UC-27)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Related posts }
 */
router.get('/:id/related', postController.related);

// Comments (UC-24). Declared before /:slug so the /:id/comments paths win.
/**
 * @swagger
 * /posts/{id}/comments/mine:
 *   get:
 *     tags: [Blog]
 *     summary: My comments on a post (UC-24)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: My comments }
 */
router.get(
  '/:id/comments/mine',
  authenticate,
  validate(postIdParamSchema, 'params'),
  commentController.mine
);
/**
 * @swagger
 * /posts/{id}/comments:
 *   get:
 *     tags: [Blog]
 *     summary: List approved comments on a post (UC-24)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Comments }
 *   post:
 *     tags: [Blog]
 *     summary: Post a comment (UC-24) — enters moderation queue
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       201: { description: Comment created (pending moderation) }
 */
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

/**
 * @swagger
 * /posts/{slug}:
 *   get:
 *     tags: [Blog]
 *     summary: Post detail by slug (UC-25)
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Post detail }
 *       404: { description: Not found }
 */
router.get('/:slug', postController.detail);

export default router;
