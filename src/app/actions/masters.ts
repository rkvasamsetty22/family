"use server";

import { db, schema } from "@/db";
import { requireUser } from "@/auth";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { intOrNull, moneyStr, num, req, str } from "@/lib/form";
import { encrypt } from "@/lib/crypto";
import { addMonths, FREQ_MONTHS } from "@/lib/dates";
import { setSetting, type SettingKey, SETTING_DEFAULTS } from "@/lib/settings";

const refresh = () => revalidatePath("/", "layout");

// Accounts
export async function createAccount(fd: FormData) {
  await requireUser();
  await db.insert(schema.accounts).values({
    name: req(fd, "name"),
    type: req(fd, "type"),
    institution: str(fd, "institution"),
    last4: str(fd, "last4")?.slice(-4) ?? null,
    openingBalance: moneyStr(fd, "openingBalance") ?? "0",
    openingDate: str(fd, "openingDate"),
  });
  refresh();
}

export async function archiveAccount(fd: FormData) {
  await requireUser();
  await db.update(schema.accounts).set({ archived: true }).where(eq(schema.accounts.id, Number(req(fd, "id"))));
  refresh();
}

// Heads and rules
export async function createHead(fd: FormData) {
  await requireUser();
  await db
    .insert(schema.heads)
    .values({ name: req(fd, "name"), kind: req(fd, "kind") })
    .onConflictDoNothing();
  refresh();
}

export async function updateHead(fd: FormData) {
  await requireUser();
  await db
    .update(schema.heads)
    .set({ name: req(fd, "name"), kind: req(fd, "kind"), archived: fd.get("archived") === "on" })
    .where(eq(schema.heads.id, Number(req(fd, "id"))));
  refresh();
}

export async function createRule(fd: FormData) {
  await requireUser();
  await db.insert(schema.rules).values({
    pattern: req(fd, "pattern"),
    headId: Number(req(fd, "headId")),
    direction: str(fd, "direction"),
    loanId: intOrNull(fd, "loanId"),
    policyId: intOrNull(fd, "policyId"),
  });
  refresh();
}

export async function deleteRule(fd: FormData) {
  await requireUser();
  await db.delete(schema.rules).where(eq(schema.rules.id, Number(req(fd, "id"))));
  refresh();
}

// Loans
export async function createLoan(fd: FormData) {
  await requireUser();
  const principal = moneyStr(fd, "principal")!;
  await db.insert(schema.loans).values({
    direction: req(fd, "direction"),
    party: req(fd, "party"),
    purpose: str(fd, "purpose"),
    principal,
    ratePct: (num(fd, "ratePct") ?? 0).toString(),
    startDate: str(fd, "startDate"),
    tenureMonths: intOrNull(fd, "tenureMonths"),
    emi: moneyStr(fd, "emi"),
    emiDay: intOrNull(fd, "emiDay"),
    outstanding: moneyStr(fd, "outstanding") ?? principal,
    accountRefEnc: encrypt(str(fd, "accountRef")),
    notes: str(fd, "notes"),
  });
  refresh();
}

export async function updateLoanOutstanding(fd: FormData) {
  await requireUser();
  const outstanding = moneyStr(fd, "outstanding")!;
  await db
    .update(schema.loans)
    .set({ outstanding, closed: Number(outstanding) <= 0 })
    .where(eq(schema.loans.id, Number(req(fd, "id"))));
  refresh();
}

export async function deleteLoan(fd: FormData) {
  await requireUser();
  await db.delete(schema.loans).where(eq(schema.loans.id, Number(req(fd, "id"))));
  refresh();
}

// Payables and receivables
export async function createDue(fd: FormData) {
  await requireUser();
  await db.insert(schema.dues).values({
    kind: req(fd, "kind"),
    party: req(fd, "party"),
    description: req(fd, "description"),
    amount: moneyStr(fd, "amount")!,
    dueDate: req(fd, "dueDate"),
    recurrence: str(fd, "recurrence") ?? "none",
  });
  refresh();
}

// Marks a due settled; a recurring one rolls forward into the next period.
export async function settleDue(fd: FormData) {
  await requireUser();
  const id = Number(req(fd, "id"));
  const [d] = await db.select().from(schema.dues).where(eq(schema.dues.id, id));
  if (!d) return;
  await db
    .update(schema.dues)
    .set({ status: "paid", paidOn: sql`(now() at time zone 'Asia/Kolkata')::date` })
    .where(eq(schema.dues.id, id));
  const months = FREQ_MONTHS[d.recurrence];
  if (months) {
    await db.insert(schema.dues).values({
      kind: d.kind,
      party: d.party,
      description: d.description,
      amount: d.amount,
      dueDate: addMonths(d.dueDate, months),
      recurrence: d.recurrence,
    });
  }
  refresh();
}

export async function deleteDue(fd: FormData) {
  await requireUser();
  await db.delete(schema.dues).where(eq(schema.dues.id, Number(req(fd, "id"))));
  refresh();
}

// Insurance policies
export async function createPolicy(fd: FormData) {
  await requireUser();
  await db.insert(schema.policies).values({
    type: req(fd, "type"),
    insurer: req(fd, "insurer"),
    planName: str(fd, "planName"),
    policyNumberEnc: encrypt(str(fd, "policyNumber")),
    insured: str(fd, "insured"),
    sumAssured: moneyStr(fd, "sumAssured"),
    premium: moneyStr(fd, "premium"),
    frequency: str(fd, "frequency") ?? "yearly",
    nextDueDate: str(fd, "nextDueDate"),
    maturityDate: str(fd, "maturityDate"),
    nominee: str(fd, "nominee"),
    notes: str(fd, "notes"),
  });
  refresh();
}

export async function markPremiumPaid(fd: FormData) {
  await requireUser();
  const id = Number(req(fd, "id"));
  const [p] = await db.select().from(schema.policies).where(eq(schema.policies.id, id));
  const months = p ? FREQ_MONTHS[p.frequency] : undefined;
  if (p?.nextDueDate && months) {
    await db
      .update(schema.policies)
      .set({ nextDueDate: addMonths(p.nextDueDate, months) })
      .where(eq(schema.policies.id, id));
  }
  refresh();
}

export async function setPolicyActive(fd: FormData) {
  await requireUser();
  await db
    .update(schema.policies)
    .set({ active: fd.get("active") === "true" })
    .where(eq(schema.policies.id, Number(req(fd, "id"))));
  refresh();
}

export async function deletePolicy(fd: FormData) {
  await requireUser();
  await db.delete(schema.policies).where(eq(schema.policies.id, Number(req(fd, "id"))));
  refresh();
}

// Settings
export async function saveSettings(fd: FormData) {
  await requireUser();
  for (const k of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    const v = str(fd, k);
    if (v != null) await setSetting(k, v);
  }
  refresh();
}
