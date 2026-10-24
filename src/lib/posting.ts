import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import { addMonths, FREQ_MONTHS } from "./dates";

type Txn = typeof schema.transactions.$inferSelect;

// Side effects when a transaction first reaches the books:
// - a payment linked to a loan reduces its outstanding by the principal part
// - a premium linked to a policy moves its next due date forward by one period
export async function applyPostingEffects(t: Txn) {
  if (t.loanId) {
    const [loan] = await db.select().from(schema.loans).where(eq(schema.loans.id, t.loanId));
    if (loan) {
      const repaying =
        (loan.direction === "taken" && t.direction === "out") || (loan.direction === "given" && t.direction === "in");
      const lending =
        (loan.direction === "taken" && t.direction === "in") || (loan.direction === "given" && t.direction === "out");
      const outstanding = Number(loan.outstanding);
      const amount = Number(t.amount);
      let next = outstanding;
      if (repaying) {
        const interest = (outstanding * Number(loan.ratePct)) / 1200;
        next = Math.max(0, outstanding - Math.max(0, amount - interest));
      } else if (lending) {
        next = outstanding + amount;
      }
      await db
        .update(schema.loans)
        .set({ outstanding: next.toFixed(2), closed: next <= 0 ? true : loan.closed })
        .where(eq(schema.loans.id, loan.id));
    }
  }
  if (t.policyId && t.direction === "out") {
    const [p] = await db.select().from(schema.policies).where(eq(schema.policies.id, t.policyId));
    const months = p ? FREQ_MONTHS[p.frequency] : undefined;
    if (p?.nextDueDate && months) {
      await db
        .update(schema.policies)
        .set({ nextDueDate: addMonths(p.nextDueDate, months) })
        .where(eq(schema.policies.id, p.id));
    }
  }
}

export async function pendingCount() {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.transactions)
    .where(eq(schema.transactions.status, "pending"));
  return r?.n ?? 0;
}
