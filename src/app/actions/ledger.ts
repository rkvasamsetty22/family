"use server";

import { db, schema } from "@/db";
import { requireUser } from "@/auth";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { intOrNull, moneyStr, req, str } from "@/lib/form";
import { applyPostingEffects } from "@/lib/posting";
import { matchRule } from "@/lib/categorize";
import { importTransactions } from "@/lib/categorize";
import { parseCsv, parseXlsx, type ParsedTxn } from "@/lib/statements/parse";
import { aiEnabled, extractFromPdf } from "@/lib/ai";

const refresh = () => revalidatePath("/", "layout");

export async function addManualTransaction(fd: FormData) {
  await requireUser();
  const [t] = await db
    .insert(schema.transactions)
    .values({
      accountId: Number(req(fd, "accountId")),
      date: req(fd, "date"),
      description: req(fd, "description"),
      amount: moneyStr(fd, "amount")!,
      direction: req(fd, "direction"),
      headId: intOrNull(fd, "headId"),
      loanId: intOrNull(fd, "loanId"),
      policyId: intOrNull(fd, "policyId"),
      member: str(fd, "member"),
      notes: str(fd, "notes"),
      status: "posted",
      suggestedBy: "manual",
      source: "manual",
    })
    .returning();
  await applyPostingEffects(t);
  refresh();
}

export async function updateTransaction(fd: FormData) {
  await requireUser();
  const id = Number(req(fd, "id"));
  await db
    .update(schema.transactions)
    .set({ headId: intOrNull(fd, "headId"), member: str(fd, "member"), notes: str(fd, "notes") })
    .where(eq(schema.transactions.id, id));
  refresh();
}

export async function deleteTransaction(fd: FormData) {
  await requireUser();
  await db.delete(schema.transactions).where(eq(schema.transactions.id, Number(req(fd, "id"))));
  refresh();
}

// Confirm one line from the review queue, optionally saving an "always do this" rule
// that is also applied to the other pending lines it matches.
export async function postReviewed(fd: FormData) {
  await requireUser();
  const id = Number(req(fd, "id"));
  const headId = Number(req(fd, "headId"));
  const loanId = intOrNull(fd, "loanId");
  const policyId = intOrNull(fd, "policyId");
  const member = str(fd, "member");
  const [t] = await db
    .update(schema.transactions)
    .set({ headId, loanId, policyId, member, status: "posted" })
    .where(and(eq(schema.transactions.id, id), eq(schema.transactions.status, "pending")))
    .returning();
  if (t) await applyPostingEffects(t);

  const pattern = str(fd, "pattern");
  if (fd.get("saveRule") && pattern && t) {
    const [rule] = await db
      .insert(schema.rules)
      .values({ pattern, headId, loanId, policyId, direction: t.direction })
      .returning();
    const pending = await db.select().from(schema.transactions).where(eq(schema.transactions.status, "pending"));
    for (const p of pending) {
      if (!matchRule([rule], p.description, p.direction)) continue;
      const [u] = await db
        .update(schema.transactions)
        .set({ headId, loanId, policyId, status: "posted", suggestedBy: "rule" })
        .where(and(eq(schema.transactions.id, p.id), eq(schema.transactions.status, "pending")))
        .returning();
      if (u) await applyPostingEffects(u);
    }
  }
  refresh();
}

export async function postAllSuggested() {
  await requireUser();
  const pending = await db.select().from(schema.transactions).where(eq(schema.transactions.status, "pending"));
  for (const p of pending) {
    if (!p.headId) continue;
    const [u] = await db
      .update(schema.transactions)
      .set({ status: "posted" })
      .where(and(eq(schema.transactions.id, p.id), eq(schema.transactions.status, "pending")))
      .returning();
    if (u) await applyPostingEffects(u);
  }
  refresh();
}

export async function importStatement(fd: FormData): Promise<void> {
  await requireUser();
  const accountId = Number(req(fd, "accountId"));
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/import?error=" + encodeURIComponent("Choose a file"));
  const name = file.name.toLowerCase();
  let parsed: ParsedTxn[];
  try {
    if (name.endsWith(".csv") || name.endsWith(".txt")) parsed = parseCsv(await file.text());
    else if (name.endsWith(".xlsx")) parsed = await parseXlsx(await file.arrayBuffer());
    else if (name.endsWith(".pdf")) {
      if (!aiEnabled()) throw new Error("PDF reading needs ANTHROPIC_API_KEY. Download the statement as CSV or Excel instead.");
      parsed = await extractFromPdf(await file.arrayBuffer());
    } else if (name.endsWith(".xls")) {
      throw new Error("Old .xls files are not supported. Open it and save as .xlsx or .csv, or download the PDF.");
    } else throw new Error("Upload a CSV, XLSX or PDF statement.");
  } catch (e) {
    redirect("/import?error=" + encodeURIComponent((e as Error).message));
  }
  const r = await importTransactions(accountId, file.name, parsed);
  refresh();
  redirect(`/review?added=${r.added}&skipped=${r.skipped}&auto=${r.autoPosted}`);
}
