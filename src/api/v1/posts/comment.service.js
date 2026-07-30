// src/api/v1/posts/comment.service.js
// Blog comments (UC-24).
//   create — authed user posts a comment; inserted as PENDING (needs moderation)
//   listApproved — public list, APPROVED only, paginated, newest first
//   listMine — the caller's own comments on a post (any status) so the UI can
//              show "Đang chờ duyệt" for their still-pending ones
import prisma from '../../../config/db.js';
import { paginatedResponse } from '../../../utils/pagination.js';
import { NotFoundError } from '../../../utils/apiError.js';
import { sanitizeText } from '../../../utils/sanitize.js';

const publicSelect = {
  id: true,
  content: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, fullName: true, avatarUrl: true } },
};

export const commentService = {
  /**
   * UC-24 — create a comment on a PUBLISHED post. Always inserted with
   * status=PENDING; an admin approves it later (see adminCommentService).
   */
  async create({ postId, userId, content }) {
    const id = Number(postId);
    const post = await prisma.post.findFirst({
      where: { id, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!post) throw new NotFoundError('Post');

    return prisma.comment.create({
      data: { postId: id, userId, content: sanitizeText(content), status: 'PENDING' },
      select: publicSelect,
    });
  },

  /** UC-24 — public list of APPROVED comments for a post, newest first. */
  async listApproved({ postId, page = 1, size = 10 }) {
    const id = Number(postId);
    const where = { postId: id, status: 'APPROVED' };
    const [items, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        select: publicSelect,
      }),
      prisma.comment.count({ where }),
    ]);
    return paginatedResponse(items, total, { page, size });
  },

  /**
   * The caller's own comments on a post (any status), so the UI can surface
   * their pending/rejected ones that aren't in the public list yet.
   */
  async listMine({ postId, userId }) {
    return prisma.comment.findMany({
      where: { postId: Number(postId), userId },
      orderBy: { createdAt: 'desc' },
      select: publicSelect,
    });
  },
};

export default commentService;
