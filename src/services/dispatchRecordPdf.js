// Marketplace Phase E — "Lệnh điều xe" (dispatch record) PDF + CSV.
// Immutable payout supporting document (HĐ CCDV Điều 2).
import PDFDocument from 'pdfkit';

const fmt = (n) => (n == null ? '—' : `${Number(n || 0).toLocaleString('vi-VN')} d`);
const pct = (r) => (r == null ? '—' : `${(Number(r) * 100).toFixed(1)}%`);
const dmy = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
};

/**
 * Build a PDF Buffer for a dispatch record (lệnh điều xe).
 * @param {object} record — the object returned by dispatchService.exportDispatchRecord
 * @returns {Promise<Buffer>}
 */
export function buildDispatchRecordPdf(record) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const b = record.booking || {};
    const f = record.financials || {};

    doc.fontSize(18).text('CarGoGo', { continued: false });
    doc.fontSize(13).text('LENH DIEU XE', { align: 'left' });
    doc.fontSize(10).text(`Ma lenh: ${record.dispatchRecordCode}`);
    doc.text(`Ngay phat hanh: ${dmy(record.issuedAt)}`);
    doc.moveDown(0.5);

    doc.fontSize(11).text('1. Nha cung cap (Ben B):', { underline: true });
    doc.fontSize(10);
    doc.text(`Ten: ${record.supplier?.name || ''}`);
    doc.text(`MST: ${record.supplier?.taxCode || '—'}`);
    doc.text(`Giay phep VT: ${record.supplier?.transportLicenseNo || '—'}`);
    doc.text(`Hop dong: ${record.supplier?.contractRef || '—'}`);
    doc.text(`Lien he: ${record.supplier?.contactName || '—'} — ${record.supplier?.contactPhone || '—'}`);
    doc.moveDown(0.5);

    doc.fontSize(11).text('2. Thong tin chuyen:', { underline: true });
    doc.fontSize(10);
    doc.text(`Booking #${b.id} · Trang thai: ${b.status}`);
    doc.text(`Don khach: ${dmy(b.pickupAt)} — Tra khach: ${dmy(b.returnAt)}`);
    doc.text(`Diem di: ${b.pickupAddress || ''}`);
    doc.text(`Diem den: ${b.dropoffAddress || ''}`);
    doc.text(`Loai xe: ${b.vehicleType || '—'} · Hinh thuc: ${b.rentalType || '—'}`);
    doc.text(`Km du kien: ${b.estimatedKm ?? '—'} · Km thuc te: ${b.actualKm ?? '—'}`);
    if (b.supplierVehicleNote) doc.text(`Ghi chu xe: ${b.supplierVehicleNote}`);
    doc.moveDown(0.5);

    doc.fontSize(11).text('3. Tai xe duoc phan cong:', { underline: true });
    doc.fontSize(10);
    if (record.driver) {
      doc.text(`Ho ten: ${record.driver.fullName || '—'}`);
      doc.text(`SDT: ${record.driver.phone || '—'}`);
    } else {
      doc.text('Chua phan cong tai xe.');
    }
    doc.moveDown(0.5);

    doc.fontSize(11).text('4. Tai chinh (noi bo CarGoGo):', { underline: true });
    doc.fontSize(10);
    doc.text(`Gia tri chuyen (finalAmount): ${fmt(f.finalAmount)}`);
    doc.text(`Ty le hoa hong: ${pct(f.commissionRate)}`);
    doc.text(`Hoa hong CarGoGo: ${fmt(f.commissionAmount)}`);
    doc.fontSize(11).text(`Payout cho supplier: ${fmt(f.supplierPayout)}`, { underline: true });

    doc.moveDown(2);
    doc.fontSize(8).text(`Xuat luc: ${new Date().toISOString()} — CarGoGo B2B Marketplace`, {
      align: 'right',
    });

    doc.end();
  });
}

const csvEscape = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Build a single-row CSV for a dispatch record.
 * @param {object} record
 * @returns {string}
 */
export function buildDispatchRecordCsv(record) {
  const b = record.booking || {};
  const f = record.financials || {};
  const headers = [
    'dispatchRecordCode',
    'issuedAt',
    'bookingId',
    'status',
    'pickupAt',
    'returnAt',
    'pickupAddress',
    'dropoffAddress',
    'vehicleType',
    'rentalType',
    'estimatedKm',
    'actualKm',
    'supplierName',
    'supplierTaxCode',
    'transportLicenseNo',
    'driverFullName',
    'driverPhone',
    'finalAmount',
    'commissionRate',
    'commissionAmount',
    'supplierPayout',
  ];
  const row = [
    record.dispatchRecordCode,
    record.issuedAt ? new Date(record.issuedAt).toISOString() : '',
    b.id,
    b.status,
    b.pickupAt ? new Date(b.pickupAt).toISOString() : '',
    b.returnAt ? new Date(b.returnAt).toISOString() : '',
    b.pickupAddress,
    b.dropoffAddress,
    b.vehicleType,
    b.rentalType,
    b.estimatedKm,
    b.actualKm,
    record.supplier?.name,
    record.supplier?.taxCode,
    record.supplier?.transportLicenseNo,
    record.driver?.fullName,
    record.driver?.phone,
    f.finalAmount,
    f.commissionRate,
    f.commissionAmount,
    f.supplierPayout,
  ];
  return `${headers.join(',')}\n${row.map(csvEscape).join(',')}\n`;
}

export default { buildDispatchRecordPdf, buildDispatchRecordCsv };
