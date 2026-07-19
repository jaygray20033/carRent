// Admin supplier CRUD + member invite (Marketplace Phase A).
import prisma from '../../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  UnprocessableError,
  ForbiddenError,
  GoneError,
} from '../../../../utils/apiError.js';
import {
  generateInviteToken,
  isInviteExpired,
  inviteExpiresAt,
} from '../../../../utils/corporateInvite.js';
import { DEFAULT_COMMISSION_RATE } from '../../../../constants/supplier.js';
import { notificationService } from '../../../../services/notificationService.js';
import logger from '../../../../config/logger.js';
import env from '../../../../config/env.js';

const supplierInclude = {
  _count: { select: { members: true, bookings: true } },
};

function publicMember(m) {
  if (!m) return m;
  const { inviteToken, ...rest } = m;
  return rest;
}

export const adminSupplierService = {
  async create(data) {
    if (!data?.name || !String(data.name).trim()) {
      throw new UnprocessableError('Tên nhà cung cấp là bắt buộc', 'NAME_REQUIRED');
    }
    if (data.taxCode) {
      const exists = await prisma.supplier.findUnique({
        where: { taxCode: String(data.taxCode).trim() },
      });
      if (exists) throw new ConflictError('Mã số thuế đã tồn tại', 'TAX_CODE_EXISTS');
    }

    const rate =
      data.commissionRate != null
        ? Number(data.commissionRate)
        : DEFAULT_COMMISSION_RATE;
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new UnprocessableError('commissionRate phải trong [0, 1]', 'INVALID_COMMISSION_RATE');
    }

    return prisma.supplier.create({
      data: {
        name: String(data.name).trim(),
        taxCode: data.taxCode ? String(data.taxCode).trim() : null,
        address: data.address || null,
        contactName: data.contactName || null,
        contactPhone: data.contactPhone || null,
        contactEmail: data.contactEmail || null,
        commissionRate: rate,
        note: data.note || null,
        contractRef: data.contractRef || null,
        contractStart: data.contractStart ? new Date(data.contractStart) : null,
        contractEnd: data.contractEnd ? new Date(data.contractEnd) : null,
        transportLicenseNo: data.transportLicenseNo || null,
        isActive: data.isActive !== false,
      },
      include: supplierInclude,
    });
  },

  async list({ q, isActive, page = 1, size = 20 } = {}) {
    const where = {};
    if (typeof isActive === 'boolean') where.isActive = isActive;
    if (q && String(q).trim()) {
      const term = String(q).trim();
      where.OR = [
        { name: { contains: term } },
        { taxCode: { contains: term } },
        { contactName: { contains: term } },
        { contactPhone: { contains: term } },
        { contactEmail: { contains: term } },
        { contractRef: { contains: term } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        include: supplierInclude,
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.supplier.count({ where }),
    ]);
    return { items, total, page, size };
  },

  async getById(id) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: Number(id) },
      include: {
        ...supplierInclude,
        members: {
          include: {
            user: { select: { id: true, fullName: true, phone: true, email: true, status: true } },
          },
          orderBy: [{ isAdmin: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
    if (!supplier) throw new NotFoundError('Supplier');
    return {
      ...supplier,
      members: (supplier.members || []).map(publicMember),
    };
  },

  async update(id, data) {
    const supplier = await prisma.supplier.findUnique({ where: { id: Number(id) } });
    if (!supplier) throw new NotFoundError('Supplier');

    const patch = {};
    if (data.name !== undefined) patch.name = String(data.name).trim();
    if (data.taxCode !== undefined) {
      const tax = data.taxCode ? String(data.taxCode).trim() : null;
      if (tax && tax !== supplier.taxCode) {
        const exists = await prisma.supplier.findUnique({ where: { taxCode: tax } });
        if (exists) throw new ConflictError('Mã số thuế đã tồn tại', 'TAX_CODE_EXISTS');
      }
      patch.taxCode = tax;
    }
    if (data.address !== undefined) patch.address = data.address || null;
    if (data.contactName !== undefined) patch.contactName = data.contactName || null;
    if (data.contactPhone !== undefined) patch.contactPhone = data.contactPhone || null;
    if (data.contactEmail !== undefined) patch.contactEmail = data.contactEmail || null;
    if (data.note !== undefined) patch.note = data.note || null;
    if (data.contractRef !== undefined) patch.contractRef = data.contractRef || null;
    if (data.contractStart !== undefined) {
      patch.contractStart = data.contractStart ? new Date(data.contractStart) : null;
    }
    if (data.contractEnd !== undefined) {
      patch.contractEnd = data.contractEnd ? new Date(data.contractEnd) : null;
    }
    if (data.transportLicenseNo !== undefined) {
      patch.transportLicenseNo = data.transportLicenseNo || null;
    }
    if (data.isActive !== undefined) patch.isActive = Boolean(data.isActive);
    if (data.commissionRate !== undefined) {
      const rate = Number(data.commissionRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
        throw new UnprocessableError('commissionRate phải trong [0, 1]', 'INVALID_COMMISSION_RATE');
      }
      patch.commissionRate = rate;
    }

    return prisma.supplier.update({
      where: { id: supplier.id },
      data: patch,
      include: supplierInclude,
    });
  },

  async deactivate(id) {
    return this.update(id, { isActive: false });
  },

  /**
   * Invite a member (admin or driver) into the supplier.
   * Mirrors corporateEmployeeService.invite.
   */
  async inviteMember(supplierId, { phone, email, fullName, isAdmin = false }) {
    if (!phone && !email) {
      throw new UnprocessableError('Cần phone hoặc email để mời', 'INVITE_TARGET_REQUIRED');
    }
    const supplier = await prisma.supplier.findUnique({ where: { id: Number(supplierId) } });
    if (!supplier) throw new NotFoundError('Supplier');
    if (!supplier.isActive) {
      throw new ConflictError('Nhà cung cấp đang tạm ngưng', 'SUPPLIER_INACTIVE');
    }

    let user = null;
    if (phone) user = await prisma.user.findUnique({ where: { phone: String(phone).trim() } });
    if (!user && email) {
      user = await prisma.user.findFirst({ where: { email: String(email).trim() } });
    }

    if (user) {
      const existing = await prisma.supplierMember.findUnique({ where: { userId: user.id } });
      if (existing) {
        if (existing.supplierId === supplier.id) {
          throw new ConflictError('Người dùng đã là thành viên nhà cung cấp', 'ALREADY_MEMBER');
        }
        throw new ConflictError(
          'Người dùng đã thuộc một nhà cung cấp khác',
          'ALREADY_MEMBER_OTHER_SUPPLIER'
        );
      }
    }

    const pendingWhere = { supplierId: supplier.id, isActive: false };
    if (phone) pendingWhere.invitedPhone = String(phone).trim();
    else pendingWhere.invitedEmail = String(email).trim();

    const pending = await prisma.supplierMember.findFirst({ where: pendingWhere });
    if (pending && !pending.inviteUsedAt) {
      const token = generateInviteToken();
      const updated = await prisma.supplierMember.update({
        where: { id: pending.id },
        data: {
          inviteToken: token,
          inviteExpiresAt: inviteExpiresAt(),
          fullName: fullName ?? pending.fullName,
          isAdmin: Boolean(isAdmin),
          userId: user?.id ?? pending.userId,
        },
        include: {
          user: { select: { id: true, fullName: true, phone: true, email: true } },
        },
      });
      logger.info(
        `Supplier invite reissued memberId=${updated.id} supplierId=${supplier.id} token=${token.slice(0, 8)}…`
      );
      return { member: publicMember(updated), inviteToken: token };
    }

    const token = generateInviteToken();
    const member = await prisma.supplierMember.create({
      data: {
        supplierId: supplier.id,
        userId: user?.id ?? null,
        fullName: fullName || user?.fullName || null,
        isAdmin: Boolean(isAdmin),
        isActive: false,
        invitedPhone: phone ? String(phone).trim() : user?.phone || null,
        invitedEmail: email ? String(email).trim() : user?.email || null,
        inviteToken: token,
        inviteExpiresAt: inviteExpiresAt(),
      },
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true } },
      },
    });

    logger.info(
      `Supplier invite issued memberId=${member.id} supplierId=${supplier.id} url=${env.FRONTEND_URL}/supplier/invite/accept?token=${token.slice(0, 8)}…`
    );
    return { member: publicMember(member), inviteToken: token };
  },

  async acceptInvite({ token }, userId) {
    if (!token) throw new UnprocessableError('Thiếu invite token', 'INVITE_TOKEN_REQUIRED');

    const member = await prisma.supplierMember.findUnique({
      where: { inviteToken: String(token) },
      include: { supplier: true },
    });
    if (!member) throw new NotFoundError('Invite');
    if (member.inviteUsedAt || member.isActive) {
      throw new ConflictError('Invite đã được sử dụng', 'INVITE_ALREADY_USED');
    }
    if (isInviteExpired(member.inviteExpiresAt)) {
      throw new GoneError('Invite đã hết hạn', 'INVITE_EXPIRED');
    }
    if (member.userId && member.userId !== Number(userId)) {
      throw new ForbiddenError('Invite không dành cho tài khoản này');
    }

    const other = await prisma.supplierMember.findFirst({
      where: { userId: Number(userId), isActive: true, id: { not: member.id } },
    });
    if (other) {
      throw new ConflictError(
        'Bạn đã thuộc một nhà cung cấp khác',
        'ALREADY_MEMBER_OTHER_SUPPLIER'
      );
    }

    // Promote role based on isAdmin flag.
    const roleCode = member.isAdmin ? 'SUPPLIER_ADMIN' : 'SUPPLIER_DRIVER';
    const role = await prisma.role.findUnique({ where: { code: roleCode } });

    const updated = await prisma.$transaction(async (tx) => {
      if (role) {
        await tx.user.update({
          where: { id: Number(userId) },
          data: { roleId: role.id },
        });
      }
      return tx.supplierMember.update({
        where: { id: member.id },
        data: {
          userId: Number(userId),
          isActive: true,
          inviteUsedAt: new Date(),
        },
        include: {
          supplier: true,
          user: { select: { id: true, fullName: true, phone: true, email: true } },
        },
      });
    });

    await notificationService
      .notify({
        userId: Number(userId),
        type: 'SUPPLIER_INVITE_ACCEPTED',
        title: 'Tham gia nhà cung cấp thành công',
        body: `Bạn đã tham gia ${member.supplier?.name || 'nhà cung cấp'}.`,
        link: '/supplier',
      })
      .catch(() => {});

    return publicMember(updated);
  },

  async listMembers(supplierId, { page = 1, size = 50 } = {}) {
    const where = { supplierId: Number(supplierId) };
    const [items, total] = await Promise.all([
      prisma.supplierMember.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, phone: true, email: true, status: true } },
        },
        orderBy: [{ isAdmin: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.supplierMember.count({ where }),
    ]);
    return { items: items.map(publicMember), total, page, size };
  },

  async updateMember(supplierId, memberId, data) {
    const member = await prisma.supplierMember.findFirst({
      where: { id: Number(memberId), supplierId: Number(supplierId) },
    });
    if (!member) throw new NotFoundError('Supplier member');

    const patch = {};
    if (data.fullName !== undefined) patch.fullName = data.fullName || null;
    if (data.isAdmin !== undefined) patch.isAdmin = Boolean(data.isAdmin);
    if (data.isActive !== undefined) patch.isActive = Boolean(data.isActive);

    const updated = await prisma.supplierMember.update({
      where: { id: member.id },
      data: patch,
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true, status: true } },
      },
    });
    return publicMember(updated);
  },

  async removeMember(supplierId, memberId) {
    const member = await prisma.supplierMember.findFirst({
      where: { id: Number(memberId), supplierId: Number(supplierId) },
      include: {
        bookings: {
          where: { status: { in: ['DISPATCHED', 'DRIVER_ASSIGNED', 'IN_PROGRESS', 'PENDING_CONFIRM'] } },
          take: 1,
        },
      },
    });
    if (!member) throw new NotFoundError('Supplier member');
    if (member.bookings.length > 0) {
      throw new ConflictError(
        'Không thể xoá thành viên đang có chuyến hoạt động',
        'MEMBER_HAS_ACTIVE_BOOKING'
      );
    }

    const removed = await prisma.supplierMember.update({
      where: { id: member.id },
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

  /**
   * Commission report for a supplier over [from, to].
   * Lists SETTLED bookings with commission snapshot + totals.
   * supplierPayout = finalAmount − commissionAmount (theoretical; no auto-pay).
   */
  async commissionReport(supplierId, { from, to } = {}) {
    const supplier = await prisma.supplier.findUnique({ where: { id: Number(supplierId) } });
    if (!supplier) throw new NotFoundError('Supplier');

    const where = {
      supplierId: supplier.id,
      status: 'SETTLED',
      commissionAmount: { not: null },
    };
    if (from || to) {
      where.completedAt = {};
      if (from) where.completedAt.gte = new Date(from);
      if (to) {
        const end = new Date(to);
        if (!String(to).includes('T')) end.setHours(23, 59, 59, 999);
        where.completedAt.lte = end;
      }
    }

    const bookings = await prisma.corporateBooking.findMany({
      where,
      select: {
        id: true,
        pickupAt: true,
        returnAt: true,
        completedAt: true,
        finalAmount: true,
        commissionRate: true,
        commissionAmount: true,
        status: true,
        dispatchedAt: true,
      },
      orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
    });

    let totalFinalAmount = 0;
    let totalCommission = 0;
    const items = bookings.map((b) => {
      const finalAmount = Number(b.finalAmount) || 0;
      const commissionAmount = Number(b.commissionAmount) || 0;
      const supplierPayout = Math.round(finalAmount - commissionAmount);
      totalFinalAmount += finalAmount;
      totalCommission += commissionAmount;
      return {
        bookingId: b.id,
        pickupAt: b.pickupAt,
        completedAt: b.completedAt,
        finalAmount,
        commissionRate: b.commissionRate,
        commissionAmount,
        supplierPayout,
        dispatchRecordCode: `LDX-${b.id}-01`,
      };
    });

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        taxCode: supplier.taxCode,
        commissionRate: supplier.commissionRate,
      },
      from: from || null,
      to: to || null,
      bookingCount: items.length,
      totalFinalAmount: Math.round(totalFinalAmount),
      totalCommission: Math.round(totalCommission),
      totalSupplierPayout: Math.round(totalFinalAmount - totalCommission),
      items,
    };
  },
};

export default adminSupplierService;
