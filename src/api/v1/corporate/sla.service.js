// ENT-Day 3 — UC-78/79/80 SLA management + violation reporting.
import prisma from '../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableError,
} from '../../../utils/apiError.js';
import { notificationService } from '../../../services/notificationService.js';
import { sendEmail } from '../../../integrations/email.js';
import {
  evaluateTerminationRisk,
  formatViolationRate,
} from '../../../services/slaReport.service.js';
import logger from '../../../config/logger.js';

const VIOLATION_REPORTABLE = new Set(['IN_PROGRESS', 'PENDING_CONFIRM', 'CONFIRMED']);
// Spec QA mentions COMPLETED — map to CONFIRMED/PENDING_CONFIRM in our status model.
const SEVERITIES = new Set(['MINOR', 'MAJOR', 'CRITICAL']);

// evidenceUrls is persisted as a JSON-array string. Keep write/read symmetric so a
// stored value is ALWAYS valid JSON (or null) and reads never throw on a bad row —
// one malformed record must not 500 a whole listing (e.g. the admin queue).
function serializeEvidenceUrls(input) {
  if (Array.isArray(input)) return input.length ? JSON.stringify(input) : null;
  if (typeof input === 'string' && input.trim()) {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed.length ? JSON.stringify(parsed) : null;
    } catch {
      // not pre-encoded JSON — fall through and treat as a single raw URL
    }
    return JSON.stringify([input]);
  }
  return null;
}

function parseEvidenceUrls(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [raw];
  }
}

async function notifyCarGoGoAdmins(payload) {
  const admins = await prisma.user.findMany({
    where: { status: 'ACTIVE', role: { code: 'ADMIN' } },
    select: { id: true, email: true },
    take: 20,
  });
  await Promise.all(
    admins.map((a) => notificationService.notify({ userId: a.id, ...payload }))
  );
  return admins;
}

async function notifyCorporateAdmins(corporateId, payload) {
  const admins = await prisma.corporateEmployee.findMany({
    where: { corporateId, isAdmin: true, isActive: true, userId: { not: null } },
    select: { userId: true, user: { select: { email: true } } },
  });
  await Promise.all(
    admins.map((a) => notificationService.notify({ userId: a.userId, ...payload }))
  );
  return admins;
}

async function countConfirmedCritical(corporateId) {
  const client = await prisma.corporateClient.findUnique({
    where: { id: Number(corporateId) },
  });
  if (!client) return 0;

  // Only count confirmed CRITICAL within active contract term (if contractEnd set).
  const now = new Date();
  const where = {
    isConfirmed: true,
    severity: 'CRITICAL',
    sla: { corporateId: Number(corporateId) },
  };
  if (client.contractEnd && new Date(client.contractEnd).getTime() < now.getTime()) {
    // Contract expired — no longer count toward current risk (spec: "không tính vào count hiện tại")
    return 0;
  }
  if (client.contractStart) {
    where.createdAt = { gte: client.contractStart };
  }
  if (client.contractEnd) {
    where.createdAt = { ...(where.createdAt || {}), lte: client.contractEnd };
  }

  return prisma.sLAViolation.count({ where });
}

async function refreshTerminationRisk(corporateId) {
  const criticalCount = await countConfirmedCritical(corporateId);
  const flags = evaluateTerminationRisk(criticalCount);
  await prisma.corporateClient.update({
    where: { id: Number(corporateId) },
    data: { contractTerminationRisk: flags.contractTerminationRisk },
  });
  return flags;
}

/**
 * Marketplace: when a CRITICAL violation is confirmed on a supplier-fulfilled
 * booking, accrue it on the Supplier (the real "Bên B" under HĐ CCDV Điều 3).
 * ≥2 critical → terminationRisk = true, blocking further dispatches.
 */
async function refreshSupplierTerminationRisk(supplierId) {
  if (!supplierId) return null;
  const supplier = await prisma.supplier.findUnique({ where: { id: Number(supplierId) } });
  if (!supplier) return null;

  // Count confirmed CRITICAL violations on bookings fulfilled by this supplier
  // within the supplier's active contract term (if set).
  const where = {
    isConfirmed: true,
    severity: 'CRITICAL',
    booking: { supplierId: Number(supplierId) },
  };
  if (supplier.contractStart) where.createdAt = { gte: supplier.contractStart };
  if (supplier.contractEnd) {
    where.createdAt = { ...(where.createdAt || {}), lte: supplier.contractEnd };
  }

  const criticalCount = await prisma.sLAViolation.count({ where });
  const flags = evaluateTerminationRisk(criticalCount);

  await prisma.supplier.update({
    where: { id: supplier.id },
    data: {
      criticalViolationCount: criticalCount,
      terminationRisk: flags.contractTerminationRisk,
    },
  });

  return { supplierId: supplier.id, criticalCount, ...flags };
}

export const slaService = {
  async createSla(corporateId, data) {
    const client = await prisma.corporateClient.findUnique({
      where: { id: Number(corporateId) },
    });
    if (!client) throw new NotFoundError('Corporate client');

    const code = String(data.code || '')
      .trim()
      .toUpperCase();
    if (!code) throw new UnprocessableError('code bắt buộc', 'INVALID_SLA_CODE');

    try {
      return await prisma.contractSLA.create({
        data: {
          corporateId: client.id,
          code,
          name: String(data.name).trim(),
          description: data.description || null,
          targetValue: data.targetValue || null,
          penaltyRule: data.penaltyRule || null,
          isActive: data.isActive !== false,
        },
      });
    } catch (err) {
      if (err.code === 'P2002') {
        throw new ConflictError('SLA code đã tồn tại cho công ty này', 'SLA_CODE_EXISTS');
      }
      throw err;
    }
  },

  async listSla(corporateId) {
    const client = await prisma.corporateClient.findUnique({
      where: { id: Number(corporateId) },
    });
    if (!client) throw new NotFoundError('Corporate client');
    return prisma.contractSLA.findMany({
      where: { corporateId: client.id },
      orderBy: { id: 'asc' },
    });
  },

  /** Corporate portal — list own company's SLA catalog (+ risk flags). */
  async listMySla(membership) {
    const items = await this.listSla(membership.corporateId);
    const client = await prisma.corporateClient.findUnique({
      where: { id: membership.corporateId },
      select: {
        id: true,
        contractTerminationRisk: true,
        contractStart: true,
        contractEnd: true,
      },
    });
    const report = await this.getSlaReport(membership.corporateId);
    return {
      items,
      contractTerminationRisk: Boolean(client?.contractTerminationRisk),
      warningFlag: report.warningFlag,
      warningMessage: report.warningMessage,
      criticalCount: report.criticalCount,
    };
  },

  async updateSla(corporateId, slaId, data) {
    const sla = await prisma.contractSLA.findFirst({
      where: { id: Number(slaId), corporateId: Number(corporateId) },
    });
    if (!sla) throw new NotFoundError('Contract SLA');

    const patch = {};
    if (data.name !== undefined) patch.name = String(data.name).trim();
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.targetValue !== undefined) patch.targetValue = data.targetValue || null;
    if (data.penaltyRule !== undefined) patch.penaltyRule = data.penaltyRule || null;
    if (data.isActive !== undefined) patch.isActive = Boolean(data.isActive);

    return prisma.contractSLA.update({ where: { id: sla.id }, data: patch });
  },

  async reportViolation(membership, bookingId, data) {
    const booking = await prisma.corporateBooking.findUnique({
      where: { id: Number(bookingId) },
    });
    if (!booking) throw new NotFoundError('Corporate booking');
    if (booking.corporateId !== membership.corporateId) {
      throw new ForbiddenError('Không thuộc công ty của bạn');
    }
    if (!membership.isAdmin && booking.employeeId !== membership.id) {
      throw new ForbiddenError('Bạn chỉ báo cáo trên chuyến của mình');
    }
    // Allow IN_PROGRESS / PENDING_CONFIRM / CONFIRMED (post-trip reporting)
    if (!VIOLATION_REPORTABLE.has(booking.status)) {
      throw new ConflictError(
        `Chỉ báo cáo vi phạm khi chuyến đang/đã chạy (hiện: ${booking.status})`,
        'BOOKING_NOT_REPORTABLE'
      );
    }

    const sla = await prisma.contractSLA.findFirst({
      where: { id: Number(data.slaId), corporateId: membership.corporateId, isActive: true },
    });
    if (!sla) throw new ForbiddenError('SLA không thuộc công ty của bạn');

    const severity = String(data.severity || 'MINOR').toUpperCase();
    if (!SEVERITIES.has(severity)) {
      throw new UnprocessableError('severity không hợp lệ', 'INVALID_SEVERITY');
    }
    const description = String(data.description || '').trim();
    if (!description) {
      throw new UnprocessableError('description bắt buộc', 'INVALID_DESCRIPTION');
    }

    const evidenceUrls = serializeEvidenceUrls(data.evidenceUrls);

    const reportedBy = membership.isAdmin ? 'corporate_admin' : 'employee';

    const violation = await prisma.sLAViolation.create({
      data: {
        corporateBookingId: booking.id,
        slaId: sla.id,
        reportedBy,
        reportedById: membership.id,
        description,
        severity,
        evidenceUrls,
      },
      include: { sla: true },
    });

    await notifyCarGoGoAdmins({
      type: 'SLA_VIOLATION_REPORTED',
      title: `Vi phạm SLA booking #${booking.id}`,
      body: `[${severity}] ${sla.name}: ${description.slice(0, 120)}`,
      link: `/admin/corporate/bookings`,
    }).catch(() => {});

    return {
      ...violation,
      evidenceUrls: parseEvidenceUrls(violation.evidenceUrls),
    };
  },

  async listBookingViolations(membership, bookingId) {
    const booking = await prisma.corporateBooking.findUnique({
      where: { id: Number(bookingId) },
    });
    if (!booking) throw new NotFoundError('Corporate booking');
    if (booking.corporateId !== membership.corporateId) {
      throw new ForbiddenError('Không thuộc công ty của bạn');
    }
    if (!membership.isAdmin && booking.employeeId !== membership.id) {
      throw new ForbiddenError('Bạn chỉ xem vi phạm trên chuyến của mình');
    }

    const items = await prisma.sLAViolation.findMany({
      where: { corporateBookingId: booking.id },
      include: { sla: true },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((v) => ({
      ...v,
      evidenceUrls: parseEvidenceUrls(v.evidenceUrls),
    }));
  },

  /**
   * CarGoGo Admin queue — all SLA reports submitted by enterprises.
   * Default: pending confirmation (isConfirmed=false).
   */
  async adminListViolations({
    isConfirmed,
    severity,
    corporateId,
    page = 1,
    size = 20,
  } = {}) {
    const where = {};
    if (isConfirmed === true || isConfirmed === false) where.isConfirmed = isConfirmed;
    if (severity) where.severity = severity;
    if (corporateId) {
      where.booking = { corporateId: Number(corporateId) };
    }

    const take = Math.min(Math.max(Number(size) || 20, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [total, items] = await Promise.all([
      prisma.sLAViolation.count({ where }),
      prisma.sLAViolation.findMany({
        where,
        include: {
          sla: true,
          booking: {
            select: {
              id: true,
              status: true,
              corporateId: true,
              pickupAt: true,
              returnAt: true,
              pickupAddress: true,
              dropoffAddress: true,
              vehicleType: true,
              supplierId: true,
              corporate: {
                select: {
                  id: true,
                  name: true,
                  taxCode: true,
                  contractTerminationRisk: true,
                },
              },
              employee: {
                select: {
                  id: true,
                  employeeCode: true,
                  user: { select: { fullName: true, phone: true, email: true } },
                },
              },
            },
          },
        },
        orderBy: [{ isConfirmed: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
    ]);

    return {
      items: items.map((v) => ({
        ...v,
        evidenceUrls: parseEvidenceUrls(v.evidenceUrls),
      })),
      total,
      page: Math.max(Number(page) || 1, 1),
      size: take,
    };
  },

  async confirmViolation(violationId, { resolution } = {}) {
    const violation = await prisma.sLAViolation.findUnique({
      where: { id: Number(violationId) },
      include: {
        sla: true,
        booking: {
          include: {
            corporate: true,
            employee: { select: { userId: true, user: { select: { email: true, fullName: true } } } },
          },
        },
      },
    });
    if (!violation) throw new NotFoundError('SLA violation');
    if (violation.isConfirmed) {
      throw new ConflictError('Vi phạm đã được xác nhận', 'ALREADY_CONFIRMED');
    }

    const updated = await prisma.sLAViolation.update({
      where: { id: violation.id },
      data: {
        isConfirmed: true,
        resolution: resolution || null,
        resolvedAt: new Date(),
      },
      include: { sla: true },
    });

    const corporateId = violation.booking.corporateId;
    const flags = await refreshTerminationRisk(corporateId);

    // Marketplace: also accrue CRITICAL onto the fulfilling supplier (HĐ CCDV Điều 3).
    let supplierRisk = null;
    if (violation.severity === 'CRITICAL' && violation.booking.supplierId) {
      supplierRisk = await refreshSupplierTerminationRisk(violation.booking.supplierId);
      if (supplierRisk?.contractTerminationRisk) {
        await notifyCarGoGoAdmins({
          type: 'SUPPLIER_TERMINATION_RISK',
          title: `Supplier #${supplierRisk.supplierId} — nguy cơ chấm dứt HĐ`,
          body: `Đã có ${supplierRisk.criticalCount} vi phạm CRITICAL. Không dispatch thêm cho nhà cung cấp này.`,
          link: `/admin/suppliers/${supplierRisk.supplierId}`,
        }).catch(() => {});
      }
    }

    // Auto-alert on CRITICAL confirm
    if (violation.severity === 'CRITICAL') {
      const subject = `[CarGoGo] Cảnh báo CRITICAL SLA — ${violation.booking.corporate?.name || 'Corporate'}`;
      const bodyText = `Vi phạm CRITICAL đã được xác nhận trên booking #${violation.booking.id}.\nSLA: ${violation.sla?.name}\nMô tả: ${violation.description}\n${flags.warningMessage || ''}`;

      const CarGoGoAdmins = await notifyCarGoGoAdmins({
        type: 'SLA_CRITICAL_CONFIRMED',
        title: subject,
        body: bodyText.slice(0, 400),
        link: `/admin/corporate/clients/${corporateId}`,
      });
      const corpAdmins = await notifyCorporateAdmins(corporateId, {
        type: 'SLA_CRITICAL_CONFIRMED',
        title: 'Cảnh báo vi phạm CRITICAL',
        body: bodyText.slice(0, 400),
        link: '/enterprise/quality',
      });

      const recipients = [
        ...CarGoGoAdmins.map((a) => a.email).filter(Boolean),
        ...corpAdmins.map((a) => a.user?.email).filter(Boolean),
        violation.booking.corporate?.contactEmail,
      ].filter(Boolean);

      // Fire-and-forget emails so confirm path stays fast (esp. in tests with real SMTP).
      Promise.all(
        [...new Set(recipients)].map((to) =>
          sendEmail({
            to,
            template: 'otp',
            subject,
            data: { otp: 'CRITICAL', message: bodyText },
          }).catch((err) => {
            logger.warn(`SLA critical email failed to=${to}: ${err.message}`);
          })
        )
      ).catch(() => {});
    }

    return {
      violation: {
        ...updated,
        evidenceUrls: parseEvidenceUrls(updated.evidenceUrls),
      },
      risk: flags,
      supplierRisk,
    };
  },

  async getSlaReport(corporateId) {
    const client = await prisma.corporateClient.findUnique({
      where: { id: Number(corporateId) },
    });
    if (!client) throw new NotFoundError('Corporate client');

    const tripWhere = {
      corporateId: client.id,
      status: { not: 'CANCELLED' },
    };
    // Restrict to contract term if set
    if (client.contractStart || client.contractEnd) {
      tripWhere.pickupAt = {};
      if (client.contractStart) tripWhere.pickupAt.gte = client.contractStart;
      if (client.contractEnd) tripWhere.pickupAt.lte = client.contractEnd;
    }

    const totalTrips = await prisma.corporateBooking.count({ where: tripWhere });

    const violationWhere = {
      isConfirmed: true,
      sla: { corporateId: client.id },
    };
    // Spec: violations outside active contract term not counted when contract expired
    const now = new Date();
    const contractExpired =
      client.contractEnd && new Date(client.contractEnd).getTime() < now.getTime();
    if (contractExpired) {
      // return zeros for current risk window
      return {
        totalTrips,
        totalViolations: 0,
        violationRate: '0.0%',
        criticalCount: 0,
        byType: [],
        contractTerminationRisk: false,
        warningFlag: false,
        warningMessage: null,
      };
    }
    if (client.contractStart) {
      violationWhere.createdAt = { gte: client.contractStart };
    }
    if (client.contractEnd) {
      violationWhere.createdAt = {
        ...(violationWhere.createdAt || {}),
        lte: client.contractEnd,
      };
    }

    const violations = await prisma.sLAViolation.findMany({
      where: violationWhere,
      include: { sla: true },
    });

    // Unconfirmed must not be counted — already filtered by isConfirmed:true
    const totalViolations = violations.length;
    const criticalCount = violations.filter((v) => v.severity === 'CRITICAL').length;
    const flags = evaluateTerminationRisk(criticalCount);

    // Keep DB flag in sync
    if (client.contractTerminationRisk !== flags.contractTerminationRisk) {
      await prisma.corporateClient.update({
        where: { id: client.id },
        data: { contractTerminationRisk: flags.contractTerminationRisk },
      });
    }

    const byTypeMap = new Map();
    for (const v of violations) {
      const key = v.sla?.code || 'UNKNOWN';
      const cur = byTypeMap.get(key) || {
        slaCode: key,
        count: 0,
        severity: v.severity,
        critical: 0,
      };
      cur.count += 1;
      if (v.severity === 'CRITICAL') cur.critical += 1;
      // expose worst severity seen
      const rank = { MINOR: 1, MAJOR: 2, CRITICAL: 3 };
      if ((rank[v.severity] || 0) > (rank[cur.severity] || 0)) cur.severity = v.severity;
      byTypeMap.set(key, cur);
    }

    return {
      totalTrips,
      totalViolations,
      violationRate: formatViolationRate(totalViolations, totalTrips),
      criticalCount,
      byType: [...byTypeMap.values()],
      contractTerminationRisk: flags.contractTerminationRisk,
      warningFlag: flags.warningFlag,
      warningMessage: flags.warningMessage,
    };
  },

  // Exported for unit tests
  evaluateTerminationRisk,
  formatViolationRate,
  countConfirmedCritical,
  refreshTerminationRisk,
};

export default slaService;
