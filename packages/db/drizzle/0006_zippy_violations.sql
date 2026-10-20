ALTER TABLE "audit_fix_files" ADD COLUMN "queued_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_fix_files" ADD COLUMN "claimed_by" text;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "queued_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "claimed_by" text;