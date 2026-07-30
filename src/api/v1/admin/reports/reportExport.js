// src/api/v1/admin/reports/reportExport.js
// Day 35 (UC-59) — render a revenue report to CSV / Excel / PDF.
//   CSV   -> csv-stringify
//   Excel -> exceljs
//   PDF   -> pdfkit
//
// Each exporter writes the response directly (sets Content-Type +
// Content-Disposition) and resolves once the stream is flushed.
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const fmtVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} d`;

const fileStamp = () => new Date().toISOString().slice(0, 10);

// UTF-8 byte-order mark (U+FEFF) — prepended so Excel opens Vietnamese text
// correctly. Built from a char code (not a literal) to avoid irregular-whitespace lint.
const UTF8_BOM = String.fromCharCode(0xfeff);

/** CSV: a header block + the per-period series + a method breakdown section. */
export const exportRevenueCsv = (res, report) => {
  const rows = [
    ['CarGoGo — Báo cáo doanh thu'],
    ['Từ', report.range.from, 'Đến', report.range.to, 'Nhóm', report.group],
    ['Tổng doanh thu', report.total, 'Số giao dịch', report.count],
    [],
    ['Kỳ', 'Doanh thu (VND)', 'Số giao dịch'],
    ...report.series.map((s) => [s.period, s.revenue, s.count]),
    [],
    ['Phương thức', 'Doanh thu (VND)', 'Số giao dịch'],
    ...report.byMethod.map((m) => [m.method, m.revenue, m.count]),
  ];
  const csv = stringify(rows);
  const body = `${UTF8_BOM}${csv}`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="revenue-${fileStamp()}.csv"`);
  res.send(body);
};

/** Excel: a summary sheet with the series table + a method breakdown table. */
export const exportRevenueExcel = async (res, report) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CarGoGo';
  wb.created = new Date();

  const ws = wb.addWorksheet('Doanh thu');

  ws.mergeCells('A1:C1');
  ws.getCell('A1').value = 'CarGoGo — Báo cáo doanh thu';
  ws.getCell('A1').font = { size: 14, bold: true };

  ws.addRow([]);
  ws.addRow(['Từ', report.range.from]);
  ws.addRow(['Đến', report.range.to]);
  ws.addRow(['Nhóm', report.group]);
  ws.addRow(['Tổng doanh thu', report.total]);
  ws.addRow(['Số giao dịch', report.count]);
  ws.addRow([]);

  const seriesHeader = ws.addRow(['Kỳ', 'Doanh thu (VND)', 'Số giao dịch']);
  seriesHeader.font = { bold: true };
  for (const s of report.series) ws.addRow([s.period, s.revenue, s.count]);

  ws.addRow([]);
  const methodHeader = ws.addRow(['Phương thức', 'Doanh thu (VND)', 'Số giao dịch']);
  methodHeader.font = { bold: true };
  for (const m of report.byMethod) ws.addRow([m.method, m.revenue, m.count]);

  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 16;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="revenue-${fileStamp()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
};

/** PDF: a printable one-pager with totals, the series, and the method breakdown. */
export const exportRevenuePdf = (res, report) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="revenue-${fileStamp()}.pdf"`);

    doc.on('error', reject);
    res.on('finish', resolve);
    doc.pipe(res);

    doc.fontSize(18).text('CarGoGo — Bao cao doanh thu', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .fillColor('#555')
      .text(`Tu ${report.range.from} den ${report.range.to}  -  Nhom: ${report.group}`, {
        align: 'center',
      });
    doc.moveDown(1);

    doc.fillColor('#000').fontSize(12);
    doc.text(`Tong doanh thu: ${fmtVnd(report.total)}`);
    doc.text(`So giao dich: ${report.count}`);
    doc.moveDown(1);

    // Method breakdown.
    doc.fontSize(13).text('Theo phuong thuc', { underline: true });
    doc.moveDown(0.3).fontSize(11);
    if (report.byMethod.length === 0) {
      doc.text('Khong co du lieu.');
    } else {
      for (const m of report.byMethod) {
        doc.text(`${m.method}: ${fmtVnd(m.revenue)} (${m.count} giao dich)`);
      }
    }
    doc.moveDown(1);

    // Series (only non-zero rows to keep the PDF compact).
    doc.fontSize(13).text('Theo ky', { underline: true });
    doc.moveDown(0.3).fontSize(10);
    const nonZero = report.series.filter((s) => s.revenue > 0);
    const shown = nonZero.length ? nonZero : report.series;
    for (const s of shown) {
      doc.text(`${s.period}   ${fmtVnd(s.revenue)}   (${s.count})`);
    }

    doc.end();
  });

/** Dispatch to the right exporter by format. Returns true if it handled the response. */
export const exportRevenue = async (res, report, format) => {
  switch (format) {
    case 'csv':
      exportRevenueCsv(res, report);
      return true;
    case 'excel':
      await exportRevenueExcel(res, report);
      return true;
    case 'pdf':
      await exportRevenuePdf(res, report);
      return true;
    default:
      return false;
  }
};

export default { exportRevenue };
