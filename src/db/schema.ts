import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  date,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Money is stored as numeric(14,2) and handled as strings/numbers in app code.
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

export const heads = pgTable("heads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  // income | expense | investment | loan | transfer (only income and expense count in P&L)
  kind: text("kind").notNull(),
  isPetty: boolean("is_petty").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // bank | credit_card | cash | wallet
  type: text("type").notNull(),
  institution: text("institution"),
  last4: text("last4"),
  openingBalance: money("opening_balance").notNull().default("0"),
  openingDate: date("opening_date"),
  archived: boolean("archived").notNull().default(false),
});

export const imports = pgTable("imports", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  // taken (you owe) | given (owed to you)
  direction: text("direction").notNull(),
  party: text("party").notNull(),
  purpose: text("purpose"),
  principal: money("principal").notNull(),
  ratePct: numeric("rate_pct", { precision: 6, scale: 3 }).notNull().default("0"),
  startDate: date("start_date"),
  tenureMonths: integer("tenure_months"),
  emi: money("emi"),
  emiDay: integer("emi_day"),
  outstanding: money("outstanding").notNull(),
  accountRefEnc: text("account_ref_enc"),
  notes: text("notes"),
  closed: boolean("closed").notNull().default(false),
});

export const policies = pgTable("policies", {
  id: serial("id").primaryKey(),
  // life | term | health | vehicle | property | other
  type: text("type").notNull(),
  insurer: text("insurer").notNull(),
  planName: text("plan_name"),
  policyNumberEnc: text("policy_number_enc"),
  insured: text("insured"),
  sumAssured: money("sum_assured"),
  premium: money("premium"),
  // monthly | quarterly | half_yearly | yearly | single
  frequency: text("frequency").notNull().default("yearly"),
  nextDueDate: date("next_due_date"),
  maturityDate: date("maturity_date"),
  nominee: text("nominee"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
});

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull().references(() => accounts.id),
    date: date("date").notNull(),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    // in | out
    direction: text("direction").notNull(),
    headId: integer("head_id").references(() => heads.id),
    // pending (in review queue) | posted
    status: text("status").notNull().default("pending"),
    // where the suggested head came from: rule | transfer | petty | ai | manual
    suggestedBy: text("suggested_by"),
    source: text("source").notNull().default("manual"),
    importId: integer("import_id").references(() => imports.id, { onDelete: "set null" }),
    hash: text("hash"),
    member: text("member"),
    notes: text("notes"),
    loanId: integer("loan_id").references(() => loans.id, { onDelete: "set null" }),
    policyId: integer("policy_id").references(() => policies.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transactions_hash_idx").on(t.accountId, t.hash),
    index("transactions_date_idx").on(t.date),
    index("transactions_status_idx").on(t.status),
  ],
);

export const rules = pgTable("rules", {
  id: serial("id").primaryKey(),
  // case-insensitive substring of the description
  pattern: text("pattern").notNull(),
  // in | out | null for both
  direction: text("direction"),
  headId: integer("head_id").notNull().references(() => heads.id, { onDelete: "cascade" }),
  loanId: integer("loan_id").references(() => loans.id, { onDelete: "set null" }),
  policyId: integer("policy_id").references(() => policies.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const dues = pgTable("dues", {
  id: serial("id").primaryKey(),
  // payable (you owe) | receivable (owed to you)
  kind: text("kind").notNull(),
  party: text("party").notNull(),
  description: text("description").notNull(),
  amount: money("amount").notNull(),
  dueDate: date("due_date").notNull(),
  // none | monthly | quarterly | half_yearly | yearly
  recurrence: text("recurrence").notNull().default("none"),
  status: text("status").notNull().default("open"),
  paidOn: date("paid_on"),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// People who can sign in. Admins can add and manage the others under Family users.
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  // admin | member
  role: text("role").notNull().default("member"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
