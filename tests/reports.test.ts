import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { resolvePeriod, type Report } from "../src/lib/report-period";
import { reportFilename, safeText, toCsv, toPdf, toXlsx } from "../src/lib/report-export";
import { toneFor } from "../src/lib/nav";

const sample: Report = {
  id: "transactions",
  title: "Transactions",
  period: "FY 2026-27 (April to March)",
  sections: [
    {
      title: "Transactions",
      columns: [{ label: "Date" }, { label: "Description" }, { label: "In", money: true }, { label: "Out", money: true }],
      rows: [
        ["01 Oct 2026", "SALARY, ACME \"PVT\" LTD", 125000, null],
        ["02 Oct 2026", "=HYPERLINK(\"http://evil\")", null, 3240.5],
        ["03 Oct 2026", "₹ UPI/Ravi", null, 99],
      ],
      total: ["3 entries", "", 125000, 3339.5],
    },
  ],
};

test("periods: presets follow the Indian financial year", () => {
  assert.deepEqual(resolvePeriod({}, "2026-10-25"), { id: "fy", from: "2026-04-01", to: "2027-03-31", label: "FY 2026-27 (April to March)" });
  assert.equal(resolvePeriod({ period: "lastfy" }, "2026-10-25").from, "2025-04-01");
  assert.equal(resolvePeriod({ period: "lastfy" }, "2026-02-10").from, "2024-04-01");
  assert.deepEqual(
    [resolvePeriod({ period: "lastmonth" }, "2026-03-15").from, resolvePeriod({ period: "lastmonth" }, "2026-03-15").to],
    ["2026-02-01", "2026-02-28"],
  );
  assert.equal(resolvePeriod({ period: "month" }, "2026-12-05").to, "2026-12-31");
});

test("periods: bad custom ranges fall back to this FY", () => {
  assert.equal(resolvePeriod({ period: "custom", from: "2026-05-01", to: "2026-05-31" }, "2026-10-25").id, "custom");
  for (const bad of [
    { from: "2026-06-01", to: "2026-05-01" },
    { from: "2026-13-01", to: "2026-14-01" },
    { from: "'; drop table x", to: "2026-05-01" },
    { from: "1900-01-01", to: "2026-05-01" },
  ])
    assert.equal(resolvePeriod({ period: "custom", ...bad }, "2026-10-25").id, "fy");
});

test("CSV: quotes, BOM, and formula injection neutralised", () => {
  const csv = toCsv(sample);
  assert.ok(csv.startsWith("﻿"));
  assert.match(csv, /"SALARY, ACME ""PVT"" LTD",125000,/);
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/evil""\)",,3240.50/);
  assert.match(csv, /3 entries,,125000,3339.50/);
  assert.equal(safeText("+91 98"), "'+91 98");
  assert.equal(safeText("-fee"), "'-fee");
  assert.equal(safeText("Groceries"), "Groceries");
});

test("Excel: one sheet per section with numbers kept as numbers", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await toXlsx(sample)) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  assert.equal(ws.name, "Transactions");
  assert.equal(ws.getRow(5).getCell(3).value, 125000);
  assert.equal(ws.getRow(6).getCell(2).value, "'=HYPERLINK(\"http://evil\")");
});

test("PDF: renders a valid document", () => {
  const pdf = Buffer.from(toPdf(sample, "25 Oct 2026, 8:00 am"));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 2000);
  assert.equal(reportFilename(sample, "2026-04-01", "2027-03-31", "pdf"), "family-finance-transactions-2026-04-01-to-2027-03-31.pdf");
});

test("nav: each page gets its section's tint", () => {
  assert.equal(toneFor("/"), "overview");
  assert.equal(toneFor("/reports"), "overview");
  assert.equal(toneFor("/transactions"), "money");
  assert.equal(toneFor("/loans"), "debts");
  assert.equal(toneFor("/insurance"), "cover");
  assert.equal(toneFor("/users"), "setup");
});
