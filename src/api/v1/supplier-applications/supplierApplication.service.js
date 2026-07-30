// Supplier (nhà xe) partner applications.
//   create    — authenticated user submits an application (+ optional license file)
//   getMine   — user views their latest application
//   list      — admin, filter by status
//   getById   — admin detail
//   review    — admin APPROVE/REJECT; on APPROVE create Supplier + SupplierMember (admin)
//               and promote the applicant to SUPPLIER_ADMIN + notify
import prisma from '../../../config/db.js';
import { NotFoundError, ConflictError } from '../../../utils/apiError.js';
import { DEFAULT_COMMISSION_RATE } from '../../../constants/supplier.js';
import { notificationService } from '../../../services/notificationService.js';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

export const supplierApplicationService = {
  /** User — submit an application. Blocks a second while one is still PENDING. */
  async create(userId, data, licenseFileUrl = null) {
    const pending = await prisma.supplierApplication.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictError('Bạn đã có một hồ sơ đang chờ duyệt.');
    }

    // Already an active supplier member? Don't let them re-apply.
    const member = await prisma.supplierMember.findUnique({ where: { userId } });
    if (member && member.isActive) {
      throw new ConflictError('Tài khoản của bạn đã là đối tác nhà xe.');
    }

    return prisma.supplierApplication.create({
      data: {
        userId,
        applicantType: data.applicantType || 'BUSINESS',
        companyName: data.companyName,
        taxCode: data.taxCode || null,
        contactName: data.contactName || null,
        contactPhone: data.contactPhone || null,
        contactEmail: data.contactEmail || null,
        address: data.address,
        transportLicenseNo: data.transportLicenseNo || null,
        fleetSize: data.fleetSize ?? 1,
        vehicleTypes: data.vehicleTypes || null,
        note: data.note || null,
        licenseFileUrl: licenseFileUrl || null,
      },
    });
  },

  /** User — most recent application (status view). */
  async getMine(userId) {
    return prisma.supplierApplication.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
    });
  },

  /** Admin — list, newest first, optional status filter. */
  async list({ status, page = 1, size = 20 }) {
    const where = {};
    if (status && STATUSES.includes(status)) where.status = status;

    const [items, total] = await Promise.all([
      prisma.supplierApplication.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.supplierApplication.count({ where }),
    ]);
    return { items, total, page, size };
  },

  async getById(id) {
    const application = await prisma.supplierApplication.findUnique({
      where: { id: Number(id) },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, roleId: true } },
      },
    });
    if (!application) throw new NotFoundError('Supplier application');
    return application;
  },

  /**
   * Admin — approve/reject. Approving creates a Supplier + SupplierMember (admin),
   * promotes the applicant to SUPPLIER_ADMIN, and notifies them. Rejecting stores
   * the review note and notifies them.
   */
  async review(id, { status, reviewNote, commissionRate }, reviewerId) {
    const application = await prisma.supplierApplication.findUnique({
      where: { id: Number(id) },
    });
    if (!application) throw new NotFoundError('Supplier application');
    if (application.status !== 'PENDING') {
      throw new ConflictError('Hồ sơ này đã được xử lý.');
    }

    // Guard tax-code uniqueness before entering the transaction (better error).
    if (status === 'APPROVED' && application.taxCode) {
      const dup = await prisma.supplier.findUnique({ where: { taxCode: application.taxCode } });
      if (dup) {
        throw new ConflictError('Mã số thuế đã tồn tại ở một nhà cung cấp khác.', 'TAX_CODE_EXISTS');
      }
    }

    const rate =
      commissionRate != null && Number.isFinite(Number(commissionRate))
        ? Number(commissionRate)
        : DEFAULT_COMMISSION_RATE;

    const updated = await prisma.$transaction(async (tx) => {
      let supplierId = null;

      if (status === 'APPROVED') {
        const supplier = await tx.supplier.create({
          data: {
            name: application.companyName,
            taxCode: application.taxCode || null,
            address: application.address || null,
            contactName: application.contactName || null,
            contactPhone: application.contactPhone || null,
            contactEmail: application.contactEmail || null,
            commissionRate: rate,
            transportLicenseNo: application.transportLicenseNo || null,
            note: application.note || null,
            isActive: true,
          },
        });
        supplierId = supplier.id;

        await tx.supplierMember.create({
          data: {
            supplierId: supplier.id,
            userId: application.userId,
            fullName: application.contactName || null,
            isAdmin: true,
            isActive: true,
            invitedPhone: application.contactPhone || null,
            invitedEmail: application.contactEmail || null,
            inviteUsedAt: new Date(),
          },
        });

        const supplierRole = await tx.role.findUnique({ where: { code: 'SUPPLIER_ADMIN' } });
        if (supplierRole) {
          await tx.user.update({
            where: { id: application.userId },
            data: { roleId: supplierRole.id },
          });
        }
      }

      return tx.supplierApplication.update({
        where: { id: Number(id) },
        data: {
          status,
          reviewNote: reviewNote || null,
          reviewedBy: reviewerId || null,
          reviewedAt: new Date(),
          supplierId,
        },
      });
    });

    // Notify the applicant (best-effort; never throws into the happy path).
    if (status === 'APPROVED') {
      await notificationService
        .notify({
          userId: application.userId,
          type: 'SUPPLIER_APPLICATION_APPROVED',
          title: 'Hồ sơ đối tác nhà xe đã được duyệt',
          body: 'Chúc mừng! Tài khoản của bạn đã trở thành đối tác nhà xe của CarGoGo.',
          link: '/supplier',
        })
        .catch(() => {});
    } else {
      await notificationService
        .notify({
          userId: application.userId,
          type: 'SUPPLIER_APPLICATION_REJECTED',
          title: 'Hồ sơ đối tác nhà xe bị từ chối',
          body: reviewNote || 'Rất tiếc, hồ sơ của bạn chưa được duyệt.',
          link: '/supplier-register',
        })
        .catch(() => {});
    }

    return updated;
  },
};

export default supplierApplicationService;
