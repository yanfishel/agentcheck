CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"ip_hash" text,
	"url" text NOT NULL,
	"final_url" text,
	"host" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"score" integer,
	"grade" text,
	"error" text,
	"share_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "audits_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "audits_mode_check" CHECK ("audits"."mode" in ('quick', 'full')),
	CONSTRAINT "audits_status_check" CHECK ("audits"."status" in ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audits_user_created_idx" ON "audits" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audits_host_created_idx" ON "audits" USING btree ("host","created_at");--> statement-breakpoint
CREATE INDEX "audits_status_idx" ON "audits" USING btree ("status");