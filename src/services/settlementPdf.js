// B2B Day 5 — PDF bảng kê quyết toán (pdfkit).
import PDFDocument from 'pdfkit';

const BANK = {
  accountName: 'CONG TY OTORENT',
  accountNumber: '1042014299',
  bank: 'Vietcombank',
  branch: 'TP.HCM',
};

const fmt = (n) => `${Number(n || 0).toLocaleString('vi-VN')} d`;
const dmy = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
};

/**
 * Build a PDF Buffer for a corporate settlement statement.
 * @param {{ settlement, corporate, bookings }} data
 * @returns {Promise<Buffer>}
 */
export function buildSettlementPdf({ settlement, corporate, bookings = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(18).text('OtoRent', { continued: false });
    doc.fontSize(12).text('BANG KE QUYET TOAN DICH VU THUE XE', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Cong ty: ${corporate?.name || ''}`);
    doc.text(`Ma so thue: ${corporate?.taxCode || ''}`);
    doc.text(`Hop dong: ${corporate?.contractRef || '—'}`);
    doc.text(
      `Ky quyet toan: ${dmy(settlement.periodStart)} — ${dmy(settlement.periodEnd)}`
    );
    doc.text(`Settlement #${settlement.id} · Status: ${settlement.status}`);
    doc.moveDown();

    // Table header
    doc.fontSize(9).text(
      'Ngay | Nhan vien | Loai xe | Diem di → den | Base | Expenses | Tong',
      { underline: true }
    );
    doc.moveDown(0.3);

    for (const b of bookings) {
      const empName = b.employee?.user?.fullName || b.employee?.employeeCode || `#${b.employeeId}`;
      const date = dmy(b.completedAt || b.pickupAt);
      const line = `${date} | ${empName} | ${b.vehicleType} | ${String(b.pickupAddress).slice(0, 20)} → ${String(b.dropoffAddress).slice(0, 20)} | ${fmt(b._line?.basePrice ?? b.basePrice)} | ${fmt(b._line?.expenseTotal ?? 0)} | ${fmt(b._line?.total ?? b.finalAmount ?? b.basePrice)}`;
      doc.text(line, { width: 520 });
    }

    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Tong base: ${fmt(settlement.totalBaseAmount)}`);
    doc.text(`Tong chi phi phat sinh: ${fmt(settlement.totalExpenses)}`);
    doc.text(`VAT 10%: ${fmt(settlement.totalVat)}`);
    doc.fontSize(12).text(`TONG CONG: ${fmt(settlement.totalAmount)}`, { underline: true });

    doc.moveDown();
    doc.fontSize(10).text('Thong tin thanh toan (AssetHub):');
    doc.text(`Chu TK: ${BANK.accountName}`);
    doc.text(`STK: ${BANK.accountNumber} — ${BANK.bank} (${BANK.branch})`);

    if (settlement.note) {
      doc.moveDown();
      doc.text(`Ghi chu: ${settlement.note}`);
    }

    doc.moveDown(2);
    doc.fontSize(8).text(`Xuat luc: ${new Date().toISOString()} — OtoRent B2B`, {
      align: 'right',
    });

    doc.end();
  });
}

export const SETTLEMENT_BANK = BANK;
export default { buildSettlementPdf, SETTLEMENT_BANK };
