CREATE TABLE "audit_favicons" (
	"audit_id" uuid PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"body" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "has_favicon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_favicons" ADD CONSTRAINT "audit_favicons_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;