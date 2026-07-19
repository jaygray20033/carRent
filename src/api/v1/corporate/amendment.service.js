// ENT-Day 3 — UC-80 contract amendments (phụ lục HĐ).
import prisma from '../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableError,
} from '../../../utils/apiError.js';
import {
  isAmendmentEffective,
  mergePriceConfig,
} from '../../../services/slaReport.service.js';
import { notificationService } from '../../../services/notificationService.js';

function serialize(a) {
  let priceConfigDelta = null;
  if (a.priceConfigDelta) {
    try {
      priceConfigDelta = JSON.parse(a.priceConfigDelta);
    } catch {
      priceConfigDelta = null;
    }
  }
  const effective = isAmendmentEffective(a);
  return {
    ...a,
    priceConfigDelta,
    isEffective: effective,
    signStatus:
      a.signedByA && a.signedByB
        ? effective
          ? 'EFFECTIVE'
          : 'SIGNED_BOTH'
        : a.signedByA || a.signedByB
          ? 'SIGNED_ONE'
          : 'PENDING',
  };
}

/**
 * If both parties signed and effectiveDate reached and not yet applied,
 * merge priceConfigDelta into CorporateClient.priceConfig.
 */
async function maybeApplyPriceConfig(amendmentId) {
  const a = await prisma.contractAmendment.findUnique({
    where: { id: Number(amendmentId) },
    include: { corporate: true },
  });
  if (!a) return null;
  if (!isAmendmentEffective(a)) return serialize(a);
  if (a.appliedAt) return serialize(a);
  if (!a.priceConfigDelta) {
    // Mark applied even without price change so we don't re-check forever
    const updated = await prisma.contractAmendment.update({
      where: { id: a.id },
      data: { appliedAt: new Date() },
    });
    return serialize(updated);
  }

  // Auto-create priceConfig when missing (null/empty), then merge delta.
  const baseConfig = a.corporate.priceConfig || '{}';
  const merged = mergePriceConfig(baseConfig, a.priceConfigDelta);
  await prisma.$transaction([
    prisma.corporateClient.update({
      where: { id: a.corporateId },
      data: { priceConfig: JSON.stringify(merged) },
    }),
    prisma.contractAmendment.update({
      where: { id: a.id },
      data: { appliedAt: new Date() },
    }),
  ]);
  const refreshed = await prisma.contractAmendment.findUnique({ where: { id: a.id } });
  return serialize(refreshed);
}

export const amendmentService = {
  async create(corporateId, data) {
    const client = await prisma.corporateClient.findUnique({
      where: { id: Number(corporateId) },
    });
    if (!client) throw new NotFoundError('Corporate client');

    const effectiveDate = new Date(data.effectiveDate);
    if (Number.isNaN(effectiveDate.getTime())) {
      throw new UnprocessableError('effectiveDate không hợp lệ', 'INVALID_EFFECTIVE_DATE');
    }
    // Reject past dates (must be today or future) — use start-of-day tolerance
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (effectiveDate.getTime() < startOfToday.getTime()) {
      throw new UnprocessableError(
        'effectiveDate không được ở quá khứ',
        'EFFECTIVE_DATE_IN_PAST'
      );
    }

    const amendmentNo = String(data.amendmentNo || '').trim();
    if (!amendmentNo) {
      throw new UnprocessableError('amendmentNo bắt buộc', 'INVALID_AMENDMENT_NO');
    }

    let priceConfigDelta = null;
    if (data.priceConfigDelta != null) {
      priceConfigDelta =
        typeof data.priceConfigDelta === 'string'
          ? data.priceConfigDelta
          : JSON.stringify(data.priceConfigDelta);
    }

    try {
      const created = await prisma.contractAmendment.create({
        data: {
          corporateId: client.id,
          amendmentNo,
          title: String(data.title).trim(),
          content: String(data.content || '').trim(),
          effectiveDate,
          documentUrl: data.documentUrl || null,
          priceConfigDelta,
        },
      });
      return serialize(created);
    } catch (err) {
      if (err.code === 'P2002') {
        throw new ConflictError('Số phụ lục đã tồn tại', 'AMENDMENT_NO_EXISTS');
      }
      throw err;
    }
  },

  async listByCorporate(corporateId) {
    const items = await prisma.contractAmendment.findMany({
      where: { corporateId: Number(corporateId) },
      orderBy: { createdAt: 'desc' },
    });
    // Opportunistically apply any due amendments
    const out = [];
    for (const a of items) {
      if (isAmendmentEffective(a) && !a.appliedAt) {
        out.push(await maybeApplyPriceConfig(a.id));
      } else {
        out.push(serialize(a));
      }
    }
    return out;
  },

  async listMine(membership) {
    return this.listByCorporate(membership.corporateId);
  },

  async uploadDocument(corporateId, amendmentId, documentUrl) {
    const a = await prisma.contractAmendment.findFirst({
      where: { id: Number(amendmentId), corporateId: Number(corporateId) },
    });
    if (!a) throw new NotFoundError('Contract amendment');
    if (!documentUrl) {
      throw new UnprocessableError('documentUrl bắt buộc', 'DOCUMENT_REQUIRED');
    }
    const updated = await prisma.contractAmendment.update({
      where: { id: a.id },
      data: { documentUrl },
    });
    return serialize(updated);
  },

  /** OtoRent (Bên B) signs. */
  async signB(corporateId, amendmentId) {
    const a = await prisma.contractAmendment.findFirst({
      where: { id: Number(amendmentId), corporateId: Number(corporateId) },
    });
    if (!a) throw new NotFoundError('Contract amendment');
    if (a.signedByB) {
      throw new ConflictError('Bên B đã ký phụ lục này', 'ALREADY_SIGNED');
    }
    await prisma.contractAmendment.update({
      where: { id: a.id },
      data: { signedByB: true },
    });
    return maybeApplyPriceConfig(a.id);
  },

  /** Corporate Admin (Bên A) signs. */
  async signA(membership, amendmentId) {
    if (!membership.isAdmin) {
      throw new ForbiddenError('Chỉ Corporate Admin được ký phụ lục');
    }
    const a = await prisma.contractAmendment.findFirst({
      where: { id: Number(amendmentId), corporateId: membership.corporateId },
    });
    if (!a) throw new NotFoundError('Contract amendment');
    if (a.signedByA) {
      throw new ConflictError('Bên A đã ký phụ lục này', 'ALREADY_SIGNED');
    }
    await prisma.contractAmendment.update({
      where: { id: a.id },
      data: { signedByA: true },
    });

    // Notify OtoRent admins
    const admins = await prisma.user.findMany({
      where: { status: 'ACTIVE', role: { code: 'ADMIN' } },
      select: { id: true },
      take: 20,
    });
    await Promise.all(
      admins.map((u) =>
        notificationService.notify({
          userId: u.id,
          type: 'AMENDMENT_SIGNED_A',
          title: `Phụ lục ${a.amendmentNo} đã được Bên A ký`,
          body: a.title,
          link: `/admin/corporate/clients/${a.corporateId}`,
        })
      )
    );

    return maybeApplyPriceConfig(a.id);
  },

  isAmendmentEffective,
  mergePriceConfig,
  maybeApplyPriceConfig,
};

export default amendmentService;
