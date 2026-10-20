CREATE TABLE "audit_fix_files" (
	"audit_id" uuid PRIMARY KEY NOT NULL,
	"kinds" text[] NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress_read" integer,
	"progress_planned" integer,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "audit_fix_files_status_check" CHECK ("audit_fix_files"."status" in ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "audit_fix_files" ADD CONSTRAINT "audit_fix_files_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_fix_files_status_idx" ON "audit_fix_files" USING btree ("status");