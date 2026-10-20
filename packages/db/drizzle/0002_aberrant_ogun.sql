CREATE TABLE "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"anon_quick_per_hour" integer DEFAULT 5 NOT NULL,
	"user_full_per_day" integer DEFAULT 30 NOT NULL,
	"user_quick_per_day" integer DEFAULT 60 NOT NULL,
	"host_per_10_min" integer DEFAULT 10 NOT NULL,
	"host_running_max" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
