import Papa from "papaparse";
import ExcelJS from "exceljs";

export type ParsedTxn = {
  date: string; // yyyy-mm-dd
  description: string;
  amount: number; // always positive
  direction: "in" | "out";
  balance?: number;
};

type Cell = string | number | Date | null;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

// Indian banks use day-first dates in many shapes: 05/04/2025, 05-04-25, 05-Apr-2025, 05 Apr 2025.
export function parseDate(v: Cell): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === "number") {
    // Excel serial date
    if (v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return parseDate(d);
    }
    return null;
  }
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const mo = +m[2];
    const d = +m[1];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = s.match(/^(\d{1,2})[\/\-. ]?([A-Za-z]{3})[A-Za-z]*[\/\-., ]*(\d{2,4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return `${y}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}`;
  }
  return null;
}

export function parseAmount(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return null;
  const s = v.replace(/[₹,\s]|INR|Rs\.?/gi, "").replace(/(Cr|Dr)\.?$/i, "");
  if (!s || s === "-") return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[()\-]/g, ""));
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

const norm = (c: Cell) => String(c ?? "").toLowerCase().replace(/\s+/g, " ").trim();

type Cols = {
  date: number;
  desc: number;
  debit: number;
  credit: number;
  amount: number;
  type: number;
  balance: number;
};

function detectColumns(row: Cell[]): Cols | null {
  const h = row.map(norm);
  const find = (re: RegExp, exclude?: RegExp) =>
    h.findIndex((c) => re.test(c) && !(exclude && exclude.test(c)));
  let date = find(/(txn|tran|transaction|posting).*date|^date$/);
  if (date < 0) date = find(/date/, /value/);
  if (date < 0) date = find(/date/);
  const desc = find(/narration|description|particulars|remarks|details|transaction remarks/);
  const debit = find(/withdrawal|debit|^dr\.?$|paid out|amount \(dr\)|dr amount/);
  const credit = find(/deposit|credit|^cr\.?$|paid in|amount \(cr\)|cr amount/);
  const amount = find(/^(txn |transaction )?amount/, /(dr|cr|debit|credit)/);
  const type = find(/dr ?\/ ?cr|cr ?\/ ?dr|^type$|debit\/credit/);
  const balance = find(/balance/);
  if (date < 0 || desc < 0) return null;
  if (!(debit >= 0 && credit >= 0) && amount < 0) return null;
  return { date, desc, debit, credit, amount, type, balance };
}

export function rowsToTransactions(rows: Cell[][]): ParsedTxn[] {
  let cols: Cols | null = null;
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    cols = detectColumns(rows[i]);
    if (cols) {
      start = i + 1;
      break;
    }
  }
  if (!cols) throw new Error("Could not find the transaction table (date, description, debit/credit columns).");

  const out: ParsedTxn[] = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[cols.date]);
    const desc = String(r[cols.desc] ?? "").replace(/\s+/g, " ").trim();
    if (!date) {
      // Continuation line of a wrapped narration
      if (desc && out.length && r.filter((c) => c != null && c !== "").length === 1) {
        out[out.length - 1].description += " " + desc;
      }
      continue;
    }
    let amount: number | null = null;
    let direction: "in" | "out" | null = null;
    if (cols.debit >= 0 && cols.credit >= 0) {
      const dr = parseAmount(r[cols.debit]);
      const cr = parseAmount(r[cols.credit]);
      if (dr && Math.abs(dr) > 0) {
        amount = Math.abs(dr);
        direction = "out";
      } else if (cr && Math.abs(cr) > 0) {
        amount = Math.abs(cr);
        direction = "in";
      }
    } else {
      const a = parseAmount(r[cols.amount]);
      if (a) {
        amount = Math.abs(a);
        const t = cols.type >= 0 ? norm(r[cols.type]) : "";
        const raw = norm(r[cols.amount]);
        if (/^d|debit|dr/.test(t) || /dr$/.test(raw)) direction = "out";
        else if (/^c|credit|cr/.test(t) || /cr$/.test(raw)) direction = "in";
        else direction = a < 0 ? "out" : "in";
      }
    }
    if (!amount || !direction) continue;
    const balance = cols.balance >= 0 ? parseAmount(r[cols.balance]) ?? undefined : undefined;
    out.push({ date, description: desc || "(no description)", amount, direction, balance });
  }
  if (!out.length) throw new Error("Found the table header but no transactions under it.");
  return out;
}

export function parseCsv(text: string): ParsedTxn[] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
  return rowsToTransactions(res.data as Cell[][]);
}

export async function parseXlsx(buf: ArrayBuffer): Promise<ParsedTxn[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const errors: string[] = [];
  for (const ws of wb.worksheets) {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[]).slice(1).map((v): Cell => {
        if (v == null) return null;
        if (v instanceof Date || typeof v === "number" || typeof v === "string") return v;
        if (typeof v === "object") {
          const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
          if (o.richText) return o.richText.map((t) => t.text).join("");
          if (o.result != null) return o.result as Cell;
          if (o.text != null) return String(o.text);
        }
        return String(v);
      });
      rows.push(vals);
    });
    try {
      return rowsToTransactions(rows);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  throw new Error(errors[0] ?? "No sheets found");
}
