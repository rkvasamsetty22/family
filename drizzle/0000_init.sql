CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"institution" text,
	"last4" text,
	"opening_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"opening_date" date,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dues" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"party" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"due_date" date NOT NULL,
	"recurrence" text DEFAULT 'none' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"paid_on" date
);
--> statement-breakpoint
CREATE TABLE "heads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"is_petty" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "heads_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"filename" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"direction" text NOT NULL,
	"party" text NOT NULL,
	"purpose" text,
	"principal" numeric(14, 2) NOT NULL,
	"rate_pct" numeric(6, 3) DEFAULT '0' NOT NULL,
	"start_date" date,
	"tenure_months" integer,
	"emi" numeric(14, 2),
	"emi_day" integer,
	"outstanding" numeric(14, 2) NOT NULL,
	"account_ref_enc" text,
	"notes" text,
	"closed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"insurer" text NOT NULL,
	"plan_name" text,
	"policy_number_enc" text,
	"insured" text,
	"sum_assured" numeric(14, 2),
	"premium" numeric(14, 2),
	"frequency" text DEFAULT 'yearly' NOT NULL,
	"next_due_date" date,
	"maturity_date" date,
	"nominee" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"pattern" text NOT NULL,
	"direction" text,
	"head_id" integer NOT NULL,
	"loan_id" integer,
	"policy_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"direction" text NOT NULL,
	"head_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"suggested_by" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"import_id" integer,
	"hash" text,
	"member" text,
	"notes" text,
	"loan_id" integer,
	"policy_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_head_id_heads_id_fk" FOREIGN KEY ("head_id") REFERENCES "public"."heads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_head_id_heads_id_fk" FOREIGN KEY ("head_id") REFERENCES "public"."heads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_hash_idx" ON "transactions" USING btree ("account_id","hash");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");