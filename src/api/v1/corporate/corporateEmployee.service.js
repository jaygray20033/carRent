// src/api/v1/corporate/corporateEmployee.service.js
// B2B Day 2 — UC-62/63 invite, accept, list, update, remove employees.
import prisma from '../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  GoneError,
  UnprocessableError,
} from '../../../utils/apiError.js';
import {
  generateInviteToken,
  isInviteExpired,
  inviteExpiresAt,
  inviteLinkStatus,
} from '../../../utils/corporateInvite.js';
import { notificationService } from '../../../services/notificationService.js';
import { enqueueSendOtp } from '../../../integrations/sms.js';
import { sendEmail } from '../../../integrations/email.js';
import logger from '../../../config/logger.js';
import env from '../../../config/env.js';

const employeeInclude = {
  user: { select: { id: true, fullName: true, email: true, phone: true, status: true } },
  corporate: {
    select: {
      id: true,
      name: true,
      taxCode: true,
      contractRef: true,
      isActive: true,
      autoApproveBookings: true,
      creditLimit: true,
      paymentTermDays: true,
      priceConfig: true,
      address: true,
      contactName: true,
      contactPhone: true,
      contactEmail: true,
    },
  },
};

function serializeEmployee(emp) {
  if (!emp) return emp;
  const out = { ...emp };
  if (out.corporate?.priceConfig) {
    try {
      out.corporate = {
        ...out.corporate,
        priceConfig:
          typeof out.corporate.priceConfig === 'string'
            ? JSON.parse(out.corporate.priceConfig)
            : out.corporate.priceConfig,
      };
    } catch {
      /* keep raw */
    }
  }
  // Never leak invite token hash in list responses unless explicitly needed.
  return out;
}

export const corporateEmployeeService = {
  /** Active membership for a user (one company per user). */
  async findActiveMembership(userId) {
    return prisma.corporateEmployee.findFirst({
      where: { userId: Number(userId), isActive: true },
      include: employeeInclude,
    });
  },

  async getMyCompany(userId) {
    const membership = await this.findActiveMembership(userId);
    if (!membership) throw new ForbiddenError('Bạn chưa thuộc công ty nào');
    return {
      membership: serializeEmployee(membership),
      company: serializeEmployee(membership).corporate,
    };
  },

  // Corporate-admin self-service company settings. Scoped to req.corporate.id
  // (passed in) so a company can only edit itself; limited to the safe toggles
  // in updateMyCompanySchema — contract/credit terms stay CarGoGo-admin-only.
  async updateMyCompany(corporateId, { autoApproveBookings }) {
    const company = await prisma.corporateClient.update({
      where: { id: Number(corporateId) },
      data: { autoApproveBookings },
    });
    return { company: serializeEmployee({ corporate: company }).corporate };
  },

  async listEmployees(corporateId, { q, isActive, page = 1, size = 20 } = {}) {
    const where = { corporateId: Number(corporateId) };
    if (typeof isActive === 'boolean') where.isActive = isActive;
    if (q && String(q).trim()) {
      const term = String(q).trim();
      where.OR = [
        { employeeCode: { contains: term } },
        { department: { contains: term } },
        { invitedPhone: { contains: term } },
        { invitedEmail: { contains: term } },
        { user: { fullName: { contains: term } } },
        { user: { phone: { contains: term } } },
        { user: { email: { contains: term } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.corporateEmployee.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true, status: true } },
        },
        orderBy: [{ isAdmin: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.corporateEmployee.count({ where }),
    ]);

    // Strip invite tokens from list
    const safe = items.map(({ inviteToken, ...rest }) => rest);
    return { items: safe, total, page, size };
  },

  /**
   * Invite by phone or email.
   * - Existing User → link userId, isActive=false, issue invite token.
   * - Unknown → pending invite with invitedPhone/Email only.
   */
  async invite(corporateId, { phone, email, department, employeeCode, isAdmin = false }, inviterUserId) {
    if (!phone && !email) {
      throw new UnprocessableError('Cần phone hoặc email để mời', 'INVITE_TARGET_REQUIRED');
    }

    const corporate = await prisma.corporateClient.findUnique({
      where: { id: Number(corporateId) },
    });
    if (!corporate) throw new NotFoundError('Corporate client');
    if (!corporate.isActive) {
      throw new ConflictError('Công ty đang tạm ngưng', 'CLIENT_INACTIVE');
    }

    let user = null;
    if (phone) {
      user = await prisma.user.findUnique({ where: { phone: String(phone).trim() } });
    }
    if (!user && email) {
      user = await prisma.user.findFirst({ where: { email: String(email).trim() } });
    }

    // Already a member of this company?
    if (user) {
      const existing = await prisma.corporateEmployee.findFirst({
        where: { corporateId: Number(corporateId), userId: user.id },
      });
      if (existing) {
        throw new ConflictError('Người dùng đã là nhân viên công ty', 'ALREADY_MEMBER');
      }
      // userId is unique across all companies
      const elsewhere = await prisma.corporateEmployee.findUnique({ where: { userId: user.id } });
      if (elsewhere) {
        throw new ConflictError(
          'Người dùng đã thuộc một công ty khác',
          'ALREADY_MEMBER_OTHER_COMPANY'
        );
      }
    }

    // Pending invite for same phone/email in this company?
    const pendingWhere = { corporateId: Number(corporateId), isActive: false };
    if (phone) pendingWhere.invitedPhone = String(phone).trim();
    else pendingWhere.invitedEmail = String(email).trim();

    const pending = await prisma.corporateEmployee.findFirst({ where: pendingWhere });
    if (pending && !pending.inviteUsedAt) {
      // Re-issue token on existing pending invite
      const token = generateInviteToken();
      const updated = await prisma.corporateEmployee.update({
        where: { id: pending.id },
        data: {
          inviteToken: token,
          inviteExpiresAt: inviteExpiresAt(),
          department: department ?? pending.department,
          employeeCode: employeeCode ?? pending.employeeCode,
          isAdmin: isAdmin ?? pending.isAdmin,
          userId: user?.id ?? pending.userId,
        },
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true } },
        },
      });
      await dispatchInvite({ employee: updated, token, corporate, phone, email });
      return { employee: publicEmployee(updated), inviteToken: token };
    }

    const token = generateInviteToken();
    const employee = await prisma.corporateEmployee.create({
      data: {
        corporateId: Number(corporateId),
        userId: user?.id ?? null,
        employeeCode: employeeCode || null,
        department: department || null,
        isAdmin: Boolean(isAdmin),
        isActive: false,
        invitedPhone: phone ? String(phone).trim() : user?.phone || null,
        invitedEmail: email ? String(email).trim() : user?.email || null,
        inviteToken: token,
        inviteExpiresAt: inviteExpiresAt(),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true } },
      },
    });

    await dispatchInvite({ employee, token, corporate, phone, email });
    return { employee: publicEmployee(employee), inviteToken: token };
  },

  /**
   * Re-issue + re-send the invite for a still-pending employee row.
   * Rejects rows that are already active or whose invite was consumed.
   */
  async resendInvite(corporateId, employeeId) {
    const employee = await prisma.corporateEmployee.findFirst({
      where: { id: Number(employeeId), corporateId: Number(corporateId) },
      include: { corporate: true, user: { select: { id: true, phone: true, email: true } } },
    });
    if (!employee) throw new NotFoundError('Employee');
    if (employee.isActive || employee.inviteUsedAt) {
      throw new ConflictError('Nhân viên đã tham gia, không cần gửi lại', 'INVITE_ALREADY_USED');
    }

    const token = generateInviteToken();
    const updated = await prisma.corporateEmployee.update({
      where: { id: employee.id },
      data: { inviteToken: token, inviteExpiresAt: inviteExpiresAt() },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true } },
      },
    });
    await dispatchInvite({ employee: updated, token, corporate: employee.corporate });
    return { employee: publicEmployee(updated), inviteToken: token };
  },

  async acceptInvite({ token }, userId) {
    if (!token) throw new UnprocessableError('Thiếu invite token', 'INVITE_TOKEN_REQUIRED');

    const employee = await prisma.corporateEmployee.findUnique({
      where: { inviteToken: String(token) },
      include: { corporate: true },
    });
    if (!employee) throw new NotFoundError('Invite');

    if (employee.inviteUsedAt || employee.isActive) {
      throw new ConflictError('Invite đã được sử dụng', 'INVITE_ALREADY_USED');
    }
    if (isInviteExpired(employee.inviteExpiresAt)) {
      throw new GoneError('Invite đã hết hạn', 'INVITE_EXPIRED');
    }

    // Bind to the accepting user
    if (employee.userId && employee.userId !== Number(userId)) {
      throw new ForbiddenError('Invite không dành cho tài khoản này');
    }

    // Ensure user is not already bound to another company row. userId is globally
    // @unique, so ANY other row holding this userId (even an inactive/dangling
    // invite) makes the update below violate the constraint — catch it here as a
    // clean 409 instead of letting Prisma P2002 surface as a 500.
    const other = await prisma.corporateEmployee.findFirst({
      where: {
        userId: Number(userId),
        id: { not: employee.id },
      },
    });
    if (other) {
      throw new ConflictError(
        'Bạn đã thuộc một công ty khác',
        'ALREADY_MEMBER_OTHER_COMPANY'
      );
    }

    const updated = await prisma.corporateEmployee.update({
      where: { id: employee.id },
      data: {
        userId: Number(userId),
        isActive: true,
        inviteUsedAt: new Date(),
        // Keep token for audit but mark used; subsequent accept hits INVITE_ALREADY_USED
      },
      include: employeeInclude,
    });

    await notificationService.notify({
      userId: Number(userId),
      type: 'CORPORATE_INVITE_ACCEPTED',
      title: 'Tham gia công ty thành công',
      body: `Bạn đã tham gia ${employee.corporate?.name || 'công ty'}.`,
      link: '/enterprise',
    }).catch(() => {});

    return serializeEmployee(updated);
  },

  async updateEmployee(corporateId, employeeId, data) {
    const employee = await prisma.corporateEmployee.findFirst({
      where: { id: Number(employeeId), corporateId: Number(corporateId) },
    });
    if (!employee) throw new NotFoundError('Employee');

    const patch = {};
    if (data.department !== undefined) patch.department = data.department;
    if (data.employeeCode !== undefined) patch.employeeCode = data.employeeCode;
    if (data.isAdmin !== undefined) patch.isAdmin = Boolean(data.isAdmin);
    if (data.isActive !== undefined) patch.isActive = Boolean(data.isActive);

    const updated = await prisma.corporateEmployee.update({
      where: { id: employee.id },
      data: patch,
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, status: true } },
      },
    });
    return publicEmployee(updated);
  },

  async removeEmployee(corporateId, employeeId) {
    const employee = await prisma.corporateEmployee.findFirst({
      where: { id: Number(employeeId), corporateId: Number(corporateId) },
      include: {
        bookings: {
          where: { status: { in: ['IN_PROGRESS', 'APPROVED', 'PENDING_CONFIRM'] } },
          take: 1,
        },
      },
    });
    if (!employee) throw new NotFoundError('Employee');

    if (employee.bookings.length > 0) {
      throw new ConflictError(
        'Không thể xoá nhân viên đang có chuyến hoạt động',
        'EMPLOYEE_HAS_ACTIVE_BOOKING'
      );
    }

    // Soft-remove: keep row for booking history (FK RESTRICT on corporate_bookings).
    // Clear userId so the user can join another company later (userId is unique).
    const removed = await prisma.corporateEmployee.update({
      where: { id: employee.id },
      data: {
        isActive: false,
        isAdmin: false,
        userId: null,
        inviteToken: null,
        inviteExpiresAt: null,
      },
    });
    return { id: removed.id, deleted: true };
  },

  // ── Shareable multi-use join link (Slack-style) ──────────────────────
  // One link, many joiners; each join creates an ACTIVE employee row.

  async createInviteLink(corporateId, { maxUses, expiresInHours, defaultIsAdmin = false } = {}, createdBy) {
    const corporate = await prisma.corporateClient.findUnique({
      where: { id: Number(corporateId) },
    });
    if (!corporate) throw new NotFoundError('Corporate client');
    if (!corporate.isActive) {
      throw new ConflictError('Công ty đang tạm ngưng', 'CLIENT_INACTIVE');
    }

    const token = generateInviteToken();
    const expiresAt =
      expiresInHours != null
        ? new Date(Date.now() + Number(expiresInHours) * 3600_000)
        : null;

    const link = await prisma.corporateInviteLink.create({
      data: {
        corporateId: Number(corporateId),
        token,
        defaultIsAdmin: Boolean(defaultIsAdmin),
        maxUses: maxUses != null ? Number(maxUses) : null,
        expiresAt,
        createdBy: createdBy != null ? Number(createdBy) : null,
      },
    });
    return link;
  },

  async listInviteLinks(corporateId) {
    return prisma.corporateInviteLink.findMany({
      where: { corporateId: Number(corporateId) },
      orderBy: { createdAt: 'desc' },
    });
  },

  async revokeInviteLink(corporateId, linkId) {
    const link = await prisma.corporateInviteLink.findFirst({
      where: { id: Number(linkId), corporateId: Number(corporateId) },
    });
    if (!link) throw new NotFoundError('Invite link');
    await prisma.corporateInviteLink.update({
      where: { id: link.id },
      data: { isActive: false },
    });
    return { id: link.id, revoked: true };
  },

  /** Public preview — no auth. Returns company name + link validity (no token leak). */
  async previewInviteLink(token) {
    const link = await prisma.corporateInviteLink.findUnique({
      where: { token: String(token) },
      include: { corporate: { select: { id: true, name: true, isActive: true } } },
    });
    const status = inviteLinkStatus(link);
    if (!status.valid) {
      return { valid: false, reason: status.reason };
    }
    if (!link.corporate?.isActive) {
      return { valid: false, reason: 'CLIENT_INACTIVE' };
    }
    return {
      valid: true,
      company: { id: link.corporate.id, name: link.corporate.name },
      defaultIsAdmin: link.defaultIsAdmin,
    };
  },

  /** Authenticated join. Creates an ACTIVE employee row and bumps usedCount atomically. */
  async joinViaLink(token, userId) {
    const link = await prisma.corporateInviteLink.findUnique({
      where: { token: String(token) },
      include: { corporate: true },
    });
    const status = inviteLinkStatus(link);
    if (!status.valid) {
      if (status.reason === 'EXPIRED') throw new GoneError('Link đã hết hạn', 'LINK_EXPIRED');
      if (status.reason === 'EXHAUSTED') {
        throw new ConflictError('Link đã đạt số lượt tối đa', 'LINK_EXHAUSTED');
      }
      if (status.reason === 'REVOKED') {
        throw new ConflictError('Link đã bị thu hồi', 'LINK_REVOKED');
      }
      throw new NotFoundError('Invite link');
    }
    if (!link.corporate?.isActive) {
      throw new ConflictError('Công ty đang tạm ngưng', 'CLIENT_INACTIVE');
    }

    // Already a member of THIS company? Idempotent — return existing membership.
    const existing = await prisma.corporateEmployee.findFirst({
      where: { corporateId: link.corporateId, userId: Number(userId) },
      include: employeeInclude,
    });
    if (existing) {
      if (existing.isActive) return { employee: serializeEmployee(existing), alreadyMember: true };
      // Reactivate a soft-removed row for the same company.
      const reactivated = await prisma.corporateEmployee.update({
        where: { id: existing.id },
        data: { isActive: true, inviteUsedAt: new Date() },
        include: employeeInclude,
      });
      await prisma.corporateInviteLink.update({
        where: { id: link.id },
        data: { usedCount: { increment: 1 } },
      });
      return { employee: serializeEmployee(reactivated) };
    }

    // Bound to another company? userId is globally @unique on CorporateEmployee.
    const elsewhere = await prisma.corporateEmployee.findUnique({
      where: { userId: Number(userId) },
    });
    if (elsewhere) {
      throw new ConflictError('Bạn đã thuộc một công ty khác', 'ALREADY_MEMBER_OTHER_COMPANY');
    }

    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.corporateEmployee.create({
        data: {
          corporateId: link.corporateId,
          userId: Number(userId),
          isAdmin: link.defaultIsAdmin,
          isActive: true,
          inviteUsedAt: new Date(),
        },
        include: employeeInclude,
      });
      await tx.corporateInviteLink.update({
        where: { id: link.id },
        data: { usedCount: { increment: 1 } },
      });
      return created;
    });

    await notificationService
      .notify({
        userId: Number(userId),
        type: 'CORPORATE_INVITE_ACCEPTED',
        title: 'Tham gia công ty thành công',
        body: `Bạn đã tham gia ${link.corporate?.name || 'công ty'}.`,
        link: '/enterprise',
      })
      .catch(() => {});

    return { employee: serializeEmployee(employee) };
  },
};

function publicEmployee(emp) {
  if (!emp) return emp;
  const { inviteToken, ...rest } = emp;
  return rest;
}

async function dispatchInvite({ employee, token, corporate, phone, email }) {
  const inviteUrl = `${env.FRONTEND_URL}/corporate/invite/accept?token=${token}`;
  const targetPhone = phone || employee.invitedPhone || employee.user?.phone;
  const targetEmail = email || employee.invitedEmail || employee.user?.email;

  // SMS: reuse OTP enqueue channel as a plain notification log (no real SMS gateway yet).
  if (targetPhone) {
    try {
      await enqueueSendOtp({
        to: targetPhone,
        code: `INVITE:${token.slice(0, 8)}`,
        purpose: 'CORPORATE_INVITE',
        ttl: 48 * 3600,
        email: targetEmail || undefined,
      });
    } catch (err) {
      logger.warn(`Corporate invite SMS failed: ${err.message}`);
    }
  }

  if (targetEmail) {
    try {
      await sendEmail({
        to: targetEmail,
        subject: `Lời mời tham gia ${corporate.name} — CarGoGo B2B`,
        template: 'otp', // reuse simple template; body carries invite details
        data: {
          code: token.slice(0, 8),
          purpose: `Mời vào ${corporate.name}. Link: ${inviteUrl}`,
          ttlMinutes: 48 * 60,
        },
      });
    } catch (err) {
      logger.warn(`Corporate invite email failed: ${err.message}`);
    }
  }

  logger.info(
    `Corporate invite issued employeeId=${employee.id} corporateId=${corporate.id} url=${inviteUrl}`
  );
}

export default corporateEmployeeService;
