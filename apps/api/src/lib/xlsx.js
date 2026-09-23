/**
 * Real .xlsx workbooks for the operator exports.
 *
 * CSV was the wrong deliverable: Excel mangles a leading zero or a long number in a CSV, Telugu and
 * Hindi only survive with a BOM, and a CSV shared to WhatsApp arrives as a wall of text rather than
 * a file anyone can open. These are genuine spreadsheets — typed cells, a frozen and styled header
 * row, and column widths that fit the content.
 *
 * Money is stored as a NUMBER in rupees with a currency format, never a pre-formatted string, so
 * the person receiving it can sum a column without retyping it.
 */
import ExcelJS from 'exceljs';

const HEADER_FILL = 'FF1B3B2A'; // forest, matching the operator panel
const HEADER_FONT = 'FFF3F5EF';

/**
 * @param {{ name: string, columns: {header:string, key:string, width?:number, money?:boolean, qty?:boolean}[], rows: any[] }[]} sheets
 * @param {{ title?: string, subtitle?: string }} [meta]
 * @returns {Promise<Buffer>}
 */
export async function buildWorkbook(sheets, meta = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Farm to Flat';
  wb.created = new Date();
  if (meta.title) wb.title = meta.title;

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width || Math.max(12, c.header.length + 4),
    }));
    for (const r of sheet.rows) ws.addRow(r);

    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    head.alignment = { vertical: 'middle' };
    head.height = 22;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

    sheet.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.money) col.numFmt = '₹#,##0.00';
      if (c.qty) col.numFmt = '0.###';
    });
  }
  return /** @type {Buffer} */ (await wb.xlsx.writeBuffer());
}

/** Send a workbook as a download. */
export function sendWorkbook(res, buf, filename) {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buf.length));
  res.send(buf);
}

/** Paise (string or number) → rupees as a real number, for a money-formatted cell. */
export const rupees = (paise) => Math.round(Number(paise || 0)) / 100;
