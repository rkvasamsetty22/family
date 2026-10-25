import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { Cell, Column, Report } from "./report-period";
import { APP_NAME } from "./nav";

export const EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const num2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Text starting with these is run as a formula by Excel and Sheets (CSV injection).
// Bank descriptions come from outside, so neutralise them with a leading apostrophe.
export function safeText(s: string) {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csvField(v: Cell) {
  if (v == null) return "";
  if (typeof v === "number") return v.toFixed(2).replace(/\.00$/, "");
  const s = safeText(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportFilename(r: Report, from: string, to: string, ext: ExportFormat) {
  const slug = r.id === "all" ? "full-report" : r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `family-finance-${slug}-${from}-to-${to}.${ext}`;
}

export function toCsv(r: Report): string {
  const lines: string[] = [[APP_NAME, r.title, r.period].map(csvField).join(",")];
  for (const s of r.sections) {
    lines.push("", csvField(s.title));
    lines.push(s.columns.map((c) => csvField(c.label + (c.money ? " (INR)" : ""))).join(","));
    for (const row of s.rows) lines.push(row.map(csvField).join(","));
    if (s.total && s.rows.length) lines.push(s.total.map(csvField).join(","));
  }
  // BOM so Excel opens it as UTF-8.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export async function toXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();
  const used = new Set<string>();
  for (const s of r.sections) {
    // Sheet names: max 31 chars, unique, no []:*?/\
    let name = s.title.replace(/[[\]:*?/\\]/g, " ").slice(0, 28);
    for (let i = 2; used.has(name); i++) name = `${s.title.slice(0, 25)} ${i}`;
    used.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow([`${r.title} · ${s.title}`]).font = { bold: true, size: 13 };
    ws.addRow([r.period]).font = { color: { argb: "FF666666" } };
    ws.addRow([]);
    const head = ws.addRow(s.columns.map((c) => c.label));
    head.font = { bold: true };
    head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EAF6" } }));
    for (const row of s.rows) ws.addRow(row.map((v) => (typeof v === "string" ? safeText(v) : v)));
    if (s.total && s.rows.length) ws.addRow(s.total.map((v) => (typeof v === "string" ? safeText(v) : v))).font = { bold: true };
    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.money) col.numFmt = "#,##0.00";
      if (c.money || c.align === "right") col.alignment = { horizontal: "right" };
      const widest = Math.max(c.label.length, ...s.rows.map((row) => String(row[i] ?? "").length));
      col.width = Math.min(60, Math.max(10, widest + 2));
    });
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// The built-in PDF fonts have no ₹ glyph, so amounts are shown as plain numbers in INR.
const pdfCell = (v: Cell, c: Column) => (v == null ? "" : typeof v === "number" ? (c.money ? num2.format(v) : String(v)) : v);

export function toPdf(r: Report, generatedAt: string): ArrayBuffer {
  const wide = r.sections.some((s) => s.columns.length > 6);
  const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;
  doc.setProperties({ title: `${r.title} · ${r.period}`, creator: APP_NAME });

  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(68, 81, 199);
  doc.text(APP_NAME, margin, margin + 6);
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(20);
  doc.text(r.title, margin, margin + 26);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100);
  doc.text(`${r.period} · amounts in INR · generated ${generatedAt}`, margin, margin + 40);

  let y = margin + 58;
  for (const s of r.sections) {
    if (y > doc.internal.pageSize.getHeight() - 90) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20);
    doc.text(s.title, margin, y);
    const body = s.rows.length ? s.rows.map((row) => row.map((v, i) => pdfCell(v, s.columns[i]))) : [[s.empty ?? "Nothing to show."]];
    autoTable(doc, {
      startY: y + 6,
      margin: { left: margin, right: margin },
      head: [s.columns.map((c) => c.label)],
      body,
      foot: s.total && s.rows.length ? [s.total.map((v, i) => pdfCell(v, s.columns[i]))] : undefined,
      showFoot: "lastPage",
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 4, lineColor: [225, 226, 232], lineWidth: 0.5, overflow: "linebreak" },
      headStyles: { fillColor: [68, 81, 199], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [236, 238, 250], textColor: 20, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 248, 252] },
      // Right-align amount columns in the header and total rows too, not just the body.
      didParseCell: (d) => {
        const c = s.columns[d.column.index];
        if (c && (c.money || c.align === "right") && s.rows.length) d.cell.styles.halign = "right";
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(130);
    const h = doc.internal.pageSize.getHeight();
    doc.text(`${APP_NAME} · private and confidential`, margin, h - 18);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, h - 18, { align: "right" });
  }
  return doc.output("arraybuffer");
}
