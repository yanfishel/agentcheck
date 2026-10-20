import type { AuditResult } from "@agentcheck/core";
import type { FixFiles, FixKind } from "@agentcheck/core/fixes";
import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

/** Binary column: `Uint8Array` in code, `Buffer` on the driver side. */
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
	dataType() {
		return "bytea";
	},
	toDriver(value) {
		return Buffer.from(value);
	},
	fromDriver(value) {
		return new Uint8Array(value);
	},
});

export type Role = "admin" | "user";

/**
 * Users synced lazily from Clerk. `id` is the Clerk user id (the identity);
 * `email` is deliberately not unique because emails can change in Clerk.
 * `role` is text plus a CHECK constraint (not a pg enum) so adding a role
 * later is a plain constraint swap instead of an `ALTER TYPE`.
 */
export const users = pgTable(
	"users",
	{
		id: text("id").primaryKey(),
		email: text("email").notNull(),
		role: text("role").$type<Role>().notNull(),
		blocked: boolean("blocked").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [check("users_role_check", sql`${t.role} in ('admin', 'user')`)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type AuditMode = "quick" | "full";
export type AuditStatus = "queued" | "running" | "done" | "failed";

/**
 * One requested audit. `status` moves queued -> running -> done | failed;
 * the transitions live in `audits.ts`. `mode` and `status` are text plus
 * CHECK constraints, like `users.role`.
 */
export const audits = pgTable(
	"audits",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		ipHash: text("ip_hash"),
		url: text("url").notNull(),
		finalUrl: text("final_url"),
		host: text("host").notNull(),
		mode: text("mode").$type<AuditMode>().notNull(),
		status: text("status").$type<AuditStatus>().notNull().default("queued"),
		result: jsonb("result").$type<AuditResult>(),
		score: integer("score"),
		grade: text("grade"),
		error: text("error"),
		shareToken: text("share_token").unique(),
		hasScreenshot: boolean("has_screenshot").notNull().default(false),
		hasFavicon: boolean("has_favicon").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		/** When the row entered the queue or a busy claim last found it waiting. */
		queuedAt: timestamp("queued_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/** The pg-boss job id that claimed the row; only it may reclaim it. */
		claimedBy: text("claimed_by"),
	},
	(t) => [
		check("audits_mode_check", sql`${t.mode} in ('quick', 'full')`),
		check(
			"audits_status_check",
			sql`${t.status} in ('queued', 'running', 'done', 'failed')`,
		),
		index("audits_user_created_idx").on(t.userId, t.createdAt),
		index("audits_host_created_idx").on(t.host, t.createdAt),
		index("audits_status_idx").on(t.status),
	],
);

export type Audit = typeof audits.$inferSelect;
export type NewAudit = typeof audits.$inferInsert;

/**
 * First-screen thumbnail of a done audit, in two sizes. Kept out of `audits`
 * so list queries never read the bytes; deleted with its audit.
 */
export const auditScreenshots = pgTable("audit_screenshots", {
	auditId: uuid("audit_id")
		.primaryKey()
		.references(() => audits.id, { onDelete: "cascade" }),
	contentType: text("content_type").notNull(),
	large: bytea("large").notNull(),
	small: bytea("small").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

/**
 * The site's favicon, as fetched and validated by the audit. Kept out of
 * `audits` so list queries never read the bytes; deleted with its audit.
 */
export const auditFavicons = pgTable("audit_favicons", {
	auditId: uuid("audit_id")
		.primaryKey()
		.references(() => audits.id, { onDelete: "cascade" }),
	contentType: text("content_type").notNull(),
	body: bytea("body").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type FixFilesStatus = "queued" | "running" | "done" | "failed";

/**
 * The fix-file generation job of an audit (one row per audit). `attempts`
 * counts generations, a restart of a failed row increments it. Deleted with
 * its audit.
 */
export const auditFixFiles = pgTable(
	"audit_fix_files",
	{
		auditId: uuid("audit_id")
			.primaryKey()
			.references(() => audits.id, { onDelete: "cascade" }),
		kinds: text("kinds").array().$type<FixKind[]>().notNull(),
		attempts: integer("attempts").notNull().default(1),
		status: text("status").$type<FixFilesStatus>().notNull().default("queued"),
		progressRead: integer("progress_read"),
		progressPlanned: integer("progress_planned"),
		result: jsonb("result").$type<FixFiles>(),
		error: text("error"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		/** When the row entered the queue or a busy claim last found it waiting. */
		queuedAt: timestamp("queued_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/** The pg-boss job id that claimed the row; only it may reclaim it. */
		claimedBy: text("claimed_by"),
	},
	(t) => [
		check(
			"audit_fix_files_status_check",
			sql`${t.status} in ('queued', 'running', 'done', 'failed')`,
		),
		index("audit_fix_files_status_idx").on(t.status),
	],
);

export type AuditFixFilesRow = typeof auditFixFiles.$inferSelect;

/**
 * Editable rate limits: a single row (id = 1) created lazily by `getSettings`.
 */
export const settings = pgTable(
	"settings",
	{
		id: integer("id").primaryKey(),
		anonQuickPerHour: integer("anon_quick_per_hour").notNull().default(5),
		userFullPerDay: integer("user_full_per_day").notNull().default(30),
		userQuickPerDay: integer("user_quick_per_day").notNull().default(60),
		hostPer10Min: integer("host_per_10_min").notNull().default(10),
		hostRunningMax: integer("host_running_max").notNull().default(2),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [check("settings_single_row", sql`${t.id} = 1`)],
);

export type Settings = typeof settings.$inferSelect;
