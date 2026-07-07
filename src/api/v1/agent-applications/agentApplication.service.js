// src/api/v1/agent-applications/agentApplication.service.js
// Day 38 (UC-32/33) — agent (car owner) applications.
//   create    — authenticated user submits a partner application (+ optional KYC file)
//   getMine   — user views their latest application
//   list      — admin, filter by status
//   getById   — admin detail
//   review    — admin APPROVE/REJECT; on APPROVE promote user → AGENT + notify
import prisma from '../../../config/db.js';
import { NotFoundError, ConflictError } from '../../../utils/apiError.js';
import { notificationService } from '../../../services/notificationService.js';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

export const agentApplicationService = {
  /** User — submit an application. Blocks a second while one is still PENDING. */
  async create(userId, data, kycFileUrl = null) {
    const pending = await prisma.agentApplication.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictError('Bạn đã có một đơn đăng ký đang chờ duyệt.');
    }

    return prisma.agentApplication.create({
      data: {
        userId,
        applicantType: data.applicantType || 'INDIVIDUAL',
        businessName: data.businessName,
        taxCode: data.taxCode || null,
        address: data.address,
        expectedVehicleCount: data.expectedVehicleCount ?? 1,
        note: data.note || null,
        kycFileUrl: kycFileUrl || null,
      },
    });
  },

  /** User — most recent application (status view). */
  async getMine(userId) {
    return prisma.agentApplication.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
    });
  },

  /** Admin — list, newest first, optional status filter. */
  async list({ status, page = 1, size = 20 }) {
    const where = {};
    if (status && STATUSES.includes(status)) where.status = status;

    const [items, total] = await Promise.all([
      prisma.agentApplication.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.agentApplication.count({ where }),
    ]);
    return { items, total, page, size };
  },

  async getById(id) {
    const application = await prisma.agentApplication.findUnique({
      where: { id: Number(id) },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, roleId: true } },
      },
    });
    if (!application) throw new NotFoundError('Agent application');
    return application;
  },

  /**
   * Admin — approve/reject. Approving promotes the applicant to the AGENT role
   * and notifies them. Rejecting stores the review note and notifies them.
   */
  async review(id, { status, reviewNote }, reviewerId) {
    const application = await prisma.agentApplication.findUnique({ where: { id: Number(id) } });
    if (!application) throw new NotFoundError('Agent application');
    if (application.status !== 'PENDING') {
      throw new ConflictError('Đơn này đã được xử lý.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const app = await tx.agentApplication.update({
        where: { id: Number(id) },
        data: {
          status,
          reviewNote: reviewNote || null,
          reviewedBy: reviewerId || null,
          reviewedAt: new Date(),
        },
      });

      if (status === 'APPROVED') {
        const agentRole = await tx.role.findUnique({ where: { code: 'AGENT' } });
        if (agentRole) {
          await tx.user.update({
            where: { id: application.userId },
            data: { roleId: agentRole.id },
          });
        }
      }

      return app;
    });

    // Notify the applicant (best-effort; never throws into the happy path).
    if (status === 'APPROVED') {
      await notificationService.notify({
        userId: application.userId,
        type: 'AGENT_APPLICATION_APPROVED',
        title: 'Đơn đăng ký đối tác đã được duyệt',
        body: 'Chúc mừng! Tài khoản của bạn đã được nâng cấp thành đối tác cho thuê xe.',
        link: '/agent',
      });
    } else {
      await notificationService.notify({
        userId: application.userId,
        type: 'AGENT_APPLICATION_REJECTED',
        title: 'Đơn đăng ký đối tác bị từ chối',
        body: reviewNote || 'Rất tiếc, đơn đăng ký của bạn chưa được duyệt.',
        link: '/agent',
      });
    }

    return updated;
  },
};

export default agentApplicationService;
