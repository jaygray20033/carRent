// src/api/v1/admin/comments/adminComment.service.js
// Admin comment moderation (UC-24).
//   list     — comments filtered by status (default PENDING), newest first
//   moderate — set status to APPROVED/REJECTED; on APPROVED notify the author
import prisma from '../../../../config/db.js';
import { paginatedResponse } from '../../../../utils/pagination.js';
import { NotFoundError } from '../../../../utils/apiError.js';
import { notificationService } from '../../../../services/notificationService.js';

const adminSelect = {
  id: true,
  content: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, fullName: true, avatarUrl: true } },
  post: { select: { id: true, title: true, slug: true } },
};

export const adminCommentService = {
  /** UC-24 — moderation queue, filtered by status (default PENDING). */
  async list({ status = 'PENDING', page = 1, size = 20 }) {
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        select: adminSelect,
      }),
      prisma.comment.count({ where }),
    ]);
    return paginatedResponse(items, total, { page, size });
  },

  /**
   * UC-24 — approve/reject a comment. Approving notifies the author (UC-51
   * placeholder) with an in-app deep link to the post.
   */
  async moderate({ id, status }) {
    const commentId = Number(id);
    const existing = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, status: true, userId: true },
    });
    if (!existing) throw new NotFoundError('Comment');

    const comment = await prisma.comment.update({
      where: { id: commentId },
      data: { status },
      select: adminSelect,
    });

    // Only fire the notification on a PENDING → APPROVED transition, so
    // re-approving an already-approved comment doesn't spam the author.
    if (status === 'APPROVED' && existing.status !== 'APPROVED') {
      await notificationService.notify({
        userId: existing.userId,
        type: 'COMMENT_APPROVED',
        title: 'Bình luận của bạn đã được duyệt',
        body: `Bình luận của bạn trong bài "${comment.post.title}" đã được hiển thị công khai.`,
        link: `/magazine/${comment.post.slug}`,
      });
    }

    return comment;
  },
};

export default adminCommentService;
