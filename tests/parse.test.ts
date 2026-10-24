import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import ExcelJS from "exceljs";
import { parseCsv, parseDate, parseXlsx } from "../src/lib/statements/parse";
import { guessPattern } from "../src/lib/categorize";
import { fyRange, nextEmiDate, addMonths } from "../src/lib/dates";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

test("HDFC CSV: header below preamble, split debit/credit, Indian number format", () => {
  const t = parseCsv(fixture("hdfc.csv"));
  assert.equal(t.length, 10);
  assert.deepEqual(t[0], { date: "2026-10-01", description: "SALARY OCT ACME TECHNOLOGIES PVT LTD", amount: 125000, direction: "in", balance: 175000 });
  assert.equal(t[2].amount, 3240.5);
  assert.equal(t[2].direction, "out");
});

test("SBI CSV: dd Mon yyyy dates", () => {
  const t = parseCsv(fixture("sbi.csv"));
  assert.equal(t.length, 4);
  assert.equal(t[0].date, "2026-10-15");
  assert.equal(t[0].direction, "in");
  assert.equal(t[3].amount, 312);
});

test("ICICI CSV: uses transaction date and zero-filled columns", () => {
  const t = parseCsv(fixture("icici.csv"));
  assert.equal(t.length, 2);
  assert.equal(t[1].description, "UPI/628811/ZOMATO/zomato@hdfc");
  assert.equal(t[1].direction, "out");
});

test("single amount column with Dr/Cr marker", () => {
  const t = parseCsv("Date,Details,Amount,Dr/Cr\n01-10-2026,FUEL,500.00,DR\n02-10-2026,REFUND,120,CR\n");
  assert.deepEqual(
    t.map((x) => [x.direction, x.amount]),
    [["out", 500], ["in", 120]],
  );
});

test("XLSX with real dates and string amounts", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["Axis Bank statement"]);
  ws.addRow(["Tran Date", "CHQNO", "PARTICULARS", "DR", "CR", "BAL"]);
  ws.addRow([new Date(Date.UTC(2026, 9, 3)), "", "UPI/P2M/1234/RELIANCE SMART", 1500, null, 9000]);
  ws.addRow(["04-10-2026", "", "NEFT/ACME/SALARY", null, "50,000.00", 59000]);
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const t = await parseXlsx(buf);
  assert.equal(t.length, 2);
  assert.equal(t[0].date, "2026-10-03");
  assert.equal(t[1].amount, 50000);
  assert.equal(t[1].direction, "in");
});

test("date parsing", () => {
  assert.equal(parseDate("05/04/25"), "2025-04-05");
  assert.equal(parseDate("5-Apr-2025"), "2025-04-05");
  assert.equal(parseDate("2025-04-05"), "2025-04-05");
  assert.equal(parseDate("31/13/2025"), null);
});

test("rule pattern guess picks the merchant", () => {
  assert.equal(guessPattern("UPI-SWIGGY-swiggy@icici-ICIC0000001-6278XXXX-Payment"), "SWIGGY");
  assert.equal(guessPattern("TO TRANSFER-UPI/DR/629812/APOLLO PHARMACY/YESB/Medicines"), "APOLLO");
});

test("date helpers", () => {
  assert.deepEqual(fyRange("2026-02-10"), { start: "2025-04-01", end: "2026-03-31", label: "FY 2025-26" });
  assert.equal(nextEmiDate(5, "2026-10-24"), "2026-11-05");
  assert.equal(nextEmiDate(31, "2026-02-10"), "2026-02-28");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
});
