// Export helpers: Excel (exceljs) + PDF (pdfkit)
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

async function sendExcel(res, filename, sheetName, columns, rows, opts = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Emergent POS';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName || 'Report');

  if (opts.title) {
    ws.mergeCells(1, 1, 1, columns.length);
    const c = ws.getCell(1, 1);
    c.value = opts.title;
    c.font = { size: 16, bold: true, color: { argb: 'FF0D9488' } };
    c.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 26;
  }
  if (opts.subtitle) {
    const sr = opts.title ? 2 : 1;
    ws.mergeCells(sr, 1, sr, columns.length);
    const c = ws.getCell(sr, 1);
    c.value = opts.subtitle;
    c.font = { size: 11, italic: true, color: { argb: 'FF64748B' } };
    c.alignment = { horizontal: 'center' };
  }
  const headerRowIdx = (opts.title ? 1 : 0) + (opts.subtitle ? 1 : 0) + 1;
  ws.columns = columns.map(col => ({
    header: col.header,
    key: col.key,
    width: col.width || 18,
    style: col.numFmt ? { numFmt: col.numFmt } : undefined,
  }));
  // exceljs columns sets header on row 1; if we used merged title rows, move headers
  if (opts.title || opts.subtitle) {
    // Remove the auto header row added by columns and re-add at correct row
    ws.spliceRows(1, 1);
    const hRow = ws.getRow(headerRowIdx);
    columns.forEach((col, i) => { hRow.getCell(i + 1).value = col.header; });
  }
  const hdr = ws.getRow(headerRowIdx);
  hdr.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF0F766E' } } };
  });
  hdr.height = 22;

  for (const r of rows) {
    const row = {};
    for (const col of columns) row[col.key] = r[col.key];
    const added = ws.addRow(row);
    added.eachCell((c, i) => {
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E9F0' } } };
      const col = columns[i - 1];
      if (col && col.align) c.alignment = { horizontal: col.align };
    });
  }
  // Totals row
  if (opts.totals) {
    const tr = ws.addRow(opts.totals);
    tr.eachCell((c) => {
      c.font = { bold: true, size: 11 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FB' } };
      c.border = { top: { style: 'medium', color: { argb: 'FF0D9488' } } };
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

function startPDF(res, filename, opts = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: opts.title || filename } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);
  return doc;
}

function pdfHeader(doc, opts) {
  // Branding header bar
  const margin = 40;
  const w = doc.page.width - margin * 2;
  doc.rect(margin, margin, w, 50).fill('#0d9488');
  doc.fillColor('white').fontSize(18).font('Helvetica-Bold').text(opts.companyName || 'Emergent POS', margin + 16, margin + 14, { width: w - 32 });
  doc.fontSize(10).font('Helvetica').text(opts.subtitle || '', margin + 16, margin + 34, { width: w - 32 });
  doc.moveDown(2);
  doc.fillColor('#0f172a');
  doc.fontSize(16).font('Helvetica-Bold').text(opts.title || 'Report', margin, margin + 64);
  if (opts.range) {
    doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(opts.range, margin, margin + 84);
  }
  doc.fillColor('#0f172a');
  doc.moveDown(2);
  doc.y = margin + 110;
}

function pdfTable(doc, columns, rows, opts = {}) {
  const margin = 40;
  const pageWidth = doc.page.width - margin * 2;
  const colWidths = columns.map(c => Math.floor(pageWidth * (c.weight || (1 / columns.length))));
  let y = doc.y;

  // Header row
  doc.rect(margin, y, pageWidth, 22).fill('#0f172a');
  doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
  let x = margin + 6;
  columns.forEach((c, i) => {
    doc.text(c.header, x, y + 7, { width: colWidths[i] - 12, ellipsis: true, align: c.align || 'left' });
    x += colWidths[i];
  });
  y += 22;
  doc.fillColor('#0f172a').font('Helvetica').fontSize(9);

  for (const r of rows) {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = margin;
    }
    doc.rect(margin, y, pageWidth, 18).strokeColor('#e5e9f0').lineWidth(0.5).stroke();
    x = margin + 6;
    columns.forEach((c, i) => {
      const v = r[c.key];
      doc.text(v == null ? '' : String(v), x, y + 5, { width: colWidths[i] - 12, ellipsis: true, align: c.align || 'left' });
      x += colWidths[i];
    });
    y += 18;
  }
  doc.y = y + 10;

  if (opts.totals) {
    if (doc.y > doc.page.height - 50) doc.addPage();
    doc.rect(margin, doc.y, pageWidth, 24).fillAndStroke('#f6f8fb', '#0d9488');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10);
    x = margin + 6;
    columns.forEach((c, i) => {
      const v = opts.totals[c.key];
      doc.text(v == null ? '' : String(v), x, doc.y + 8, { width: colWidths[i] - 12, ellipsis: true, align: c.align || 'left' });
      x += colWidths[i];
    });
    doc.y += 30;
  }
}

function pdfFooter(doc) {
  const range = doc.bufferedPageRange ? doc.bufferedPageRange() : null;
  // Add page numbers via doc.on?
  doc.fontSize(8).fillColor('#94a3b8').text(`Generated: ${new Date().toLocaleString()}`, 40, doc.page.height - 30, { width: doc.page.width - 80, align: 'center' });
}

module.exports = { sendExcel, startPDF, pdfHeader, pdfTable, pdfFooter };
