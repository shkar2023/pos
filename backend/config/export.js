// Export helpers: Excel (exceljs) + PDF (pdfkit) with Arabic/Kurdish RTL support
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const ArabicReshaper = require('arabic-reshaper');
const bidiFactory = require('bidi-js');
const bidi = bidiFactory();

const FONTS_DIR = path.join(__dirname, '..', 'public', 'fonts');
const FONT_LATIN = path.join(FONTS_DIR, 'NotoSans-Regular.ttf');
const FONT_LATIN_BOLD = path.join(FONTS_DIR, 'NotoSans-Bold.ttf');
const FONT_ARABIC = path.join(FONTS_DIR, 'NotoSansArabic-Regular.ttf');
const FONT_ARABIC_BOLD = path.join(FONTS_DIR, 'NotoSansArabic-Bold.ttf');

// Arabic Unicode range (0600-06FF) + Arabic Presentation Forms (FB50-FDFF, FE70-FEFF) + Kurdish (Sorani uses Arabic block + 0750-077F)
const RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

function hasRTL(s) {
  return typeof s === 'string' && RTL_RE.test(s);
}

// Apply bidi + reshape Arabic so PDFKit renders the correct contextual glyph forms
function shapeRTL(text) {
  if (text == null) return '';
  const s = String(text);
  if (!hasRTL(s)) return s;
  // 1) Apply Unicode Bidirectional Algorithm to get visual ordering
  const embedded = bidi.getEmbeddingLevels(s, 'rtl');
  const reordered = bidi.getReorderedString(s, embedded);
  // 2) Reshape Arabic letters to their contextual joined forms
  try {
    return ArabicReshaper.convertArabic(reordered);
  } catch (e) {
    return reordered;
  }
}

// Register fonts on a PDFKit document instance
function registerFonts(doc) {
  doc.registerFont('latin', FONT_LATIN);
  doc.registerFont('latin-bold', FONT_LATIN_BOLD);
  doc.registerFont('arabic', FONT_ARABIC);
  doc.registerFont('arabic-bold', FONT_ARABIC_BOLD);
}

// Pick the appropriate font name based on whether text contains RTL chars
function pickFont(text, bold = false) {
  if (hasRTL(text)) return bold ? 'arabic-bold' : 'arabic';
  return bold ? 'latin-bold' : 'latin';
}

// ============== EXCEL ==============
async function sendExcel(res, filename, sheetName, columns, rows, opts = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Emergent POS';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName || 'Report');
  ws.views = [{ rightToLeft: !!opts.rtl }];

  if (opts.title) {
    ws.mergeCells(1, 1, 1, columns.length);
    const c = ws.getCell(1, 1);
    c.value = opts.title;
    c.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF0D9488' } };
    c.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 26;
  }
  if (opts.subtitle) {
    const sr = opts.title ? 2 : 1;
    ws.mergeCells(sr, 1, sr, columns.length);
    const c = ws.getCell(sr, 1);
    c.value = opts.subtitle;
    c.font = { name: 'Arial', size: 11, italic: true, color: { argb: 'FF64748B' } };
    c.alignment = { horizontal: 'center' };
  }
  const headerRowIdx = (opts.title ? 1 : 0) + (opts.subtitle ? 1 : 0) + 1;
  ws.columns = columns.map(col => ({
    header: col.header, key: col.key, width: col.width || 18,
    style: col.numFmt ? { numFmt: col.numFmt } : undefined,
  }));
  if (opts.title || opts.subtitle) {
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

// ============== PDF ==============
function startPDF(res, filename, opts = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: opts.title || filename } });
  registerFonts(doc);
  doc.font('latin'); // default
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);
  doc._isRTL = !!opts.rtl;
  return doc;
}

// Smart text writer: auto-picks font + reshapes RTL if needed
function pdfText(doc, text, x, y, options = {}) {
  const s = text == null ? '' : String(text);
  const bold = !!options.bold;
  doc.font(pickFont(s, bold));
  const rendered = hasRTL(s) ? shapeRTL(s) : s;
  if (x != null && y != null) return doc.text(rendered, x, y, options);
  return doc.text(rendered, options);
}

function pdfHeader(doc, opts) {
  const margin = 40;
  const w = doc.page.width - margin * 2;
  doc.rect(margin, margin, w, 50).fill('#0d9488');
  doc.fillColor('white').fontSize(18);
  pdfText(doc, opts.companyName || 'Emergent POS', margin + 16, margin + 14, { width: w - 32, bold: true, align: doc._isRTL ? 'right' : 'left' });
  doc.fontSize(10);
  pdfText(doc, opts.subtitle || '', margin + 16, margin + 34, { width: w - 32, align: doc._isRTL ? 'right' : 'left' });
  doc.moveDown(2);
  doc.fillColor('#0f172a');
  doc.fontSize(16);
  pdfText(doc, opts.title || 'Report', margin, margin + 64, { bold: true, align: doc._isRTL ? 'right' : 'left', width: w });
  if (opts.range) {
    doc.fontSize(10).fillColor('#64748b');
    pdfText(doc, opts.range, margin, margin + 84, { align: doc._isRTL ? 'right' : 'left', width: w });
  }
  doc.fillColor('#0f172a');
  doc.y = margin + 110;
}

function pdfTable(doc, columns, rows, opts = {}) {
  const margin = 40;
  const pageWidth = doc.page.width - margin * 2;
  const colWidths = columns.map(c => Math.floor(pageWidth * (c.weight || (1 / columns.length))));
  let y = doc.y;

  // Header row
  doc.rect(margin, y, pageWidth, 22).fill('#0f172a');
  doc.fillColor('white').fontSize(9);
  let x = margin + 6;
  columns.forEach((c, i) => {
    pdfText(doc, c.header, x, y + 7, {
      width: colWidths[i] - 12, ellipsis: true, align: c.align || (doc._isRTL ? 'right' : 'left'), bold: true,
    });
    x += colWidths[i];
  });
  y += 22;
  doc.fillColor('#0f172a').fontSize(9);

  for (const r of rows) {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = margin;
    }
    doc.rect(margin, y, pageWidth, 18).strokeColor('#e5e9f0').lineWidth(0.5).stroke();
    x = margin + 6;
    columns.forEach((c, i) => {
      const v = r[c.key];
      pdfText(doc, v == null ? '' : String(v), x, y + 5, {
        width: colWidths[i] - 12, ellipsis: true, align: c.align || (doc._isRTL ? 'right' : 'left'),
      });
      x += colWidths[i];
    });
    y += 18;
  }
  doc.y = y + 10;

  if (opts.totals) {
    if (doc.y > doc.page.height - 50) doc.addPage();
    doc.rect(margin, doc.y, pageWidth, 24).fillAndStroke('#f6f8fb', '#0d9488');
    doc.fillColor('#0f172a').fontSize(10);
    x = margin + 6;
    columns.forEach((c, i) => {
      const v = opts.totals[c.key];
      pdfText(doc, v == null ? '' : String(v), x, doc.y + 8, {
        width: colWidths[i] - 12, ellipsis: true, align: c.align || (doc._isRTL ? 'right' : 'left'), bold: true,
      });
      x += colWidths[i];
    });
    doc.y += 30;
  }
}

function pdfFooter(doc) {
  doc.font('latin').fontSize(8).fillColor('#94a3b8')
    .text(`Generated: ${new Date().toLocaleString()}`, 40, doc.page.height - 30, { width: doc.page.width - 80, align: 'center' });
}

module.exports = { sendExcel, startPDF, pdfHeader, pdfTable, pdfFooter, pdfText, hasRTL, shapeRTL, registerFonts, pickFont };
