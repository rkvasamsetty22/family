CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"event" text NOT NULL,
	"actor" text,
	"target" text,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL,
	"locked_until" timestamp
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");