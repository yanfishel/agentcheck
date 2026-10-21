import type {
	AuditResult,
	Favicon,
	FinishedCheck,
	Screenshot,
} from "@agentcheck/core";
import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	ilike,
	inArray,
	isNull,
	lt,
	not,
	or,
	sql,
} from "drizzle-orm";
import type { Db } from "./client.ts";
import { containsPattern } from "./like.ts";
import { AUDIT_QUEUE, hasLiveJob } from "./queue.ts";
import {
	type Audit,
	type AuditMode,
	type AuditStatus,
	auditFavicons,
	auditScreenshots,
	audits,
	users,
} from "./schema.ts";

export interface NewAuditInput {
	url: string;
	host: string;
	mode: AuditMode;
	userId: string | null;
	ipHash?: string | null;
}

export type ClaimResult =
	| { kind: "claimed"; audit: Audit }
	| { kind: "finished"; status: "done" | "failed" }
	| { kind: "missing" }
	| { kind: "busy"; host: string; mode: AuditMode }
	/** Running and claimed by another job, which owns it. */
	| { kind: "taken" };

/** A `running` audit older than this is considered abandoned by its worker. */
export const STALE_RUNNING_MS = 5 * 60_000;
/**
 * Grace before the sweep looks at a `queued` row: one whose `queued_at` is
 * older than this and that has no live pg-boss job (created, retry or
 * active) on its queue is an orphan and is failed. A row waiting in a
 * backlogged queue, or for a worker that is down, still has its job and is
 * kept however long it waits; busy claims also refresh `queued_at`.
 */
export const STALE_QUEUED_MS = 15 * 60_000;
/** Anonymous audits are deleted this many days after creation. */
export const ANONYMOUS_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
const STALE_ERROR = "Audit timed out";
const UNSCHEDULED_ERROR = "Audit could not be scheduled";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Malformed ids are treated as unknown instead of letting Postgres throw. */
const isUuid = (id: string) => UUID_RE.test(id);

const systemNow = () => new Date();

/**
 * Inserts a queued audit and hands it to `enqueue` inside the same
 * transaction: if `enqueue` throws, the insert is rolled back and the error
 * propagates, so no audit exists without a job. `before` runs first in the
 * transaction (e.g. rate limits); if it throws, nothing is inserted.
 */
export async function createAudit(
	db: Db,
	input: NewAuditInput,
	enqueue: (tx: Db, audit: Audit) => Promise<void>,
	before?: (tx: Db) => Promise<void>,
): Promise<Audit> {
	return db.transaction(async (tx) => {
		await before?.(tx);
		const [audit] = await tx
			.insert(audits)
			.values({
				url: input.url,
				host: input.host,
				mode: input.mode,
				userId: input.userId,
				ipHash: input.ipHash ?? null,
			})
			.returning();
		if (!audit) throw new Error("Failed to insert the audit");
		await enqueue(tx, audit);
		return audit;
	});
}

/** The audit with this id, or `null` if it does not exist or is malformed. */
export async function getAudit(db: Db, id: string): Promise<Audit | null> {
	if (!isUuid(id)) return null;
	const [audit] = await db
		.select()
		.from(audits)
		.where(eq(audits.id, id))
		.limit(1);
	return audit ?? null;
}

/**
 * Moves a queued or running audit to `running`, stamps `started_at` and
 * records `jobId` (the pg-boss job id) in `claimed_by`. A running audit is
 * claimed again only by the job that claimed it (pg-boss keeps the id when
 * it retries a job after a worker crash) or, for rows claimed before
 * `claimed_by` existed, by any job; another job gets `taken`. Finished audits
 * are reported, not reclaimed. With `hostRunningMax`, a queued audit whose
 * host already runs that many audits is reported `busy` and stays queued
 * (only `queued_at` is refreshed, see `STALE_QUEUED_MS`). The host advisory
 * lock is the one `enforceLimits` takes, so web inserts and worker claims
 * serialise.
 */
export async function claimAudit(
	db: Db,
	id: string,
	opts: { jobId: string; hostRunningMax?: number; now?: () => Date },
): Promise<ClaimResult> {
	if (!isUuid(id)) return { kind: "missing" };
	const now = opts.now ?? systemNow;
	const { jobId } = opts;
	return db.transaction(async (tx): Promise<ClaimResult> => {
		const [row] = await tx
			.select({ host: audits.host, mode: audits.mode, status: audits.status })
			.from(audits)
			.where(eq(audits.id, id))
			.limit(1);
		if (!row) return { kind: "missing" };
		if (row.status === "done" || row.status === "failed") {
			return { kind: "finished", status: row.status };
		}
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`host:${row.host}`}))`,
		);
		if (row.status === "queued" && opts.hostRunningMax !== undefined) {
			const [running] = await tx
				.select({ n: count() })
				.from(audits)
				.where(and(eq(audits.host, row.host), eq(audits.status, "running")));
			if ((running?.n ?? 0) >= opts.hostRunningMax) {
				await tx
					.update(audits)
					.set({ queuedAt: now() })
					.where(and(eq(audits.id, id), eq(audits.status, "queued")));
				return { kind: "busy", host: row.host, mode: row.mode };
			}
		}
		const [audit] = await tx
			.update(audits)
			.set({
				status: "running",
				startedAt: now(),
				claimedBy: jobId,
				partial: null,
				hasFavicon: false,
			})
			.where(
				and(
					eq(audits.id, id),
					or(
						eq(audits.status, "queued"),
						and(
							eq(audits.status, "running"),
							or(isNull(audits.claimedBy), eq(audits.claimedBy, jobId)),
						),
					),
				),
			)
			.returning();
		if (audit) {
			// A reclaim starts the audit over: drop what the previous run saved.
			await tx.delete(auditFavicons).where(eq(auditFavicons.auditId, id));
			return { kind: "claimed", audit };
		}
		// Claimed by another job, or finished, between the read and the lock.
		const [after] = await tx
			.select({ status: audits.status })
			.from(audits)
			.where(eq(audits.id, id))
			.limit(1);
		if (after?.status === "done" || after?.status === "failed") {
			return { kind: "finished", status: after.status };
		}
		if (after?.status === "running") return { kind: "taken" };
		return { kind: "missing" };
	});
}

/**
 * Stores the result of a running audit. Returns `false` (and changes
 * nothing) unless the audit exists and is `running`.
 */
export async function completeAudit(
	db: Db,
	id: string,
	data: {
		result: AuditResult;
		finalUrl: string;
		score: number;
		grade: string;
		screenshot?: Screenshot;
		favicon?: Favicon;
	},
	now: () => Date = systemNow,
): Promise<boolean> {
	if (!isUuid(id)) return false;
	return db.transaction(async (tx) => {
		const updated = await tx
			.update(audits)
			.set({
				status: "done",
				result: data.result,
				finalUrl: data.finalUrl,
				score: data.score,
				grade: data.grade,
				error: null,
				partial: null,
				hasScreenshot: data.screenshot !== undefined,
				// An early favicon row stays valid when none is given here.
				...(data.favicon !== undefined ? { hasFavicon: true } : {}),
				finishedAt: now(),
			})
			.where(and(eq(audits.id, id), eq(audits.status, "running")))
			.returning({ id: audits.id });
		if (updated.length !== 1) return false;
		if (data.screenshot) {
			await tx.insert(auditScreenshots).values({
				auditId: id,
				contentType: data.screenshot.contentType,
				large: data.screenshot.large,
				small: data.screenshot.small,
			});
		}
		if (data.favicon) {
			await upsertFavicon(tx, id, data.favicon);
		}
		return true;
	});
}

async function upsertFavicon(tx: Db, id: string, icon: Favicon) {
	await tx
		.insert(auditFavicons)
		.values({ auditId: id, contentType: icon.contentType, body: icon.body })
		.onConflictDoUpdate({
			target: auditFavicons.auditId,
			set: { contentType: icon.contentType, body: icon.body },
		});
}

/**
 * Adds a finished check to the `partial` map of a running audit, only for
 * the job that claimed it. Returns `false` (and changes nothing) otherwise.
 */
export async function recordAuditCheck(
	db: Db,
	id: string,
	jobId: string,
	check: FinishedCheck,
): Promise<boolean> {
	if (!isUuid(id)) return false;
	const updated = await db
		.update(audits)
		.set({
			partial: sql`coalesce(${audits.partial}, '{}'::jsonb) || ${JSON.stringify({ [check.id]: check })}::jsonb`,
		})
		.where(
			and(
				eq(audits.id, id),
				eq(audits.status, "running"),
				eq(audits.claimedBy, jobId),
			),
		)
		.returning({ id: audits.id });
	return updated.length === 1;
}

/**
 * Stores the favicon of a running audit before it finishes, only for the job
 * that claimed it. Returns `false` (and changes nothing) otherwise.
 */
export async function saveAuditFavicon(
	db: Db,
	id: string,
	jobId: string,
	icon: Favicon,
): Promise<boolean> {
	if (!isUuid(id)) return false;
	return db.transaction(async (tx) => {
		const updated = await tx
			.update(audits)
			.set({ hasFavicon: true })
			.where(
				and(
					eq(audits.id, id),
					eq(audits.status, "running"),
					eq(audits.claimedBy, jobId),
				),
			)
			.returning({ id: audits.id });
		if (updated.length !== 1) return false;
		await upsertFavicon(tx, id, icon);
		return true;
	});
}

/** The audit's site favicon, or `null` if there is none. */
export async function getAuditFavicon(
	db: Db,
	auditId: string,
): Promise<{ contentType: string; body: Uint8Array } | null> {
	if (!isUuid(auditId)) return null;
	const [row] = await db
		.select({
			contentType: auditFavicons.contentType,
			body: auditFavicons.body,
		})
		.from(auditFavicons)
		.where(eq(auditFavicons.auditId, auditId))
		.limit(1);
	return row ?? null;
}

/** One size of an audit's screenshot, or `null` if there is none. */
export async function getAuditScreenshot(
	db: Db,
	auditId: string,
	size: "small" | "large",
): Promise<{ contentType: string; body: Uint8Array } | null> {
	if (!isUuid(auditId)) return null;
	const [row] = await db
		.select({
			contentType: auditScreenshots.contentType,
			body: auditScreenshots[size],
		})
		.from(auditScreenshots)
		.where(eq(auditScreenshots.auditId, auditId))
		.limit(1);
	return row ?? null;
}

/**
 * Marks a queued or running audit as failed. Returns `false` (and changes
 * nothing) for unknown or already finished audits.
 */
export async function failAudit(
	db: Db,
	id: string,
	error: string,
	now: () => Date = systemNow,
): Promise<boolean> {
	if (!isUuid(id)) return false;
	return db.transaction(async (tx) => {
		const updated = await tx
			.update(audits)
			.set({
				status: "failed",
				error,
				finishedAt: now(),
				partial: null,
				hasFavicon: false,
			})
			.where(
				and(eq(audits.id, id), inArray(audits.status, ["queued", "running"])),
			)
			.returning({ id: audits.id });
		if (updated.length !== 1) return false;
		await tx.delete(auditFavicons).where(eq(auditFavicons.auditId, id));
		return true;
	});
}

/**
 * Fails audits stuck in `running` for longer than `STALE_RUNNING_MS` (their
 * worker died) and audits left `queued` for longer than `STALE_QUEUED_MS`
 * with no live pg-boss job (orphans). Returns how many were failed. Needs the
 * pg-boss schema in the same database (the worker starts it first).
 */
export async function failStaleAudits(
	db: Db,
	now: () => Date = systemNow,
): Promise<number> {
	const at = now();
	const runningCutoff = new Date(at.getTime() - STALE_RUNNING_MS);
	const queuedCutoff = new Date(at.getTime() - STALE_QUEUED_MS);
	return db.transaction(async (tx) => {
		const running = await tx
			.update(audits)
			.set({
				status: "failed",
				error: STALE_ERROR,
				finishedAt: at,
				partial: null,
				hasFavicon: false,
			})
			.where(
				and(eq(audits.status, "running"), lt(audits.startedAt, runningCutoff)),
			)
			.returning({ id: audits.id });
		const queued = await tx
			.update(audits)
			.set({
				status: "failed",
				error: UNSCHEDULED_ERROR,
				finishedAt: at,
				partial: null,
				hasFavicon: false,
			})
			.where(
				and(
					eq(audits.status, "queued"),
					lt(audits.queuedAt, queuedCutoff),
					not(
						hasLiveJob(
							AUDIT_QUEUE,
							sql`${sql.identifier("audits")}.${sql.identifier("id")}`,
						),
					),
				),
			)
			.returning({ id: audits.id });
		const ids = [...running, ...queued].map((r) => r.id);
		if (ids.length > 0) {
			await tx.delete(auditFavicons).where(inArray(auditFavicons.auditId, ids));
		}
		return ids.length;
	});
}

/**
 * Deletes anonymous audits created more than `ANONYMOUS_RETENTION_DAYS`
 * ago. Returns how many were deleted.
 */
export async function deleteExpiredAnonymousAudits(
	db: Db,
	now: () => Date = systemNow,
): Promise<number> {
	const cutoff = new Date(now().getTime() - ANONYMOUS_RETENTION_DAYS * DAY_MS);
	const deleted = await db
		.delete(audits)
		.where(and(isNull(audits.userId), lt(audits.createdAt, cutoff)))
		.returning({ id: audits.id });
	return deleted.length;
}

const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;

/**
 * Sets or clears (`null`) the public share token of a finished audit owned by
 * `ownerId`. Setting never replaces an existing token (two concurrent "create
 * link" requests would otherwise kill the first link): the audit comes back with
 * the token that is actually stored. Returns `null` when no such audit matched.
 */
export async function setShareToken(
	db: Db,
	id: string,
	ownerId: string,
	token: string | null,
): Promise<Audit | null> {
	if (!isUuid(id)) return null;
	const target = and(
		eq(audits.id, id),
		eq(audits.userId, ownerId),
		eq(audits.status, "done"),
	);
	const [audit] = await db
		.update(audits)
		.set({ shareToken: token })
		.where(token === null ? target : and(target, isNull(audits.shareToken)))
		.returning();
	if (audit || token === null) return audit ?? null;
	const [existing] = await db.select().from(audits).where(target);
	return existing ?? null;
}

/** The finished audit shared under this token, or `null`. */
export async function getAuditByShareToken(
	db: Db,
	token: string,
): Promise<Audit | null> {
	if (!SHARE_TOKEN_RE.test(token)) return null;
	// A blocked owner's links stop working for the time of the block; the
	// token stays, so unblocking brings them back.
	const [row] = await db
		.select({ audit: audits, ownerBlocked: users.blocked })
		.from(audits)
		.leftJoin(users, eq(users.id, audits.userId))
		.where(and(eq(audits.shareToken, token), eq(audits.status, "done")))
		.limit(1);
	if (!row || row.ownerBlocked) return null;
	return row.audit;
}

/**
 * The user's history paged by site: urls ordered by their newest audit (newest
 * first), `limit` urls from `offset`, with all their audits, so every site on
 * the page keeps its full run list.
 */
export async function listUserHistory(
	db: Db,
	userId: string,
	opts: { limit: number; offset?: number },
): Promise<Audit[]> {
	const owned = eq(audits.userId, userId);
	const latest = sql`max(${audits.createdAt})`;
	const page = await db
		.select({ url: audits.url })
		.from(audits)
		.where(owned)
		.groupBy(audits.url)
		.orderBy(desc(latest), audits.url)
		.limit(opts.limit)
		.offset(opts.offset ?? 0);
	const urls = page.map((row) => row.url);
	if (urls.length === 0) return [];
	return (
		db
			.select()
			.from(audits)
			.where(and(owned, inArray(audits.url, urls)))
			// The url tie-break matches the page order for same-instant audits.
			.orderBy(desc(audits.createdAt), audits.url)
	);
}

/** How many sites (distinct urls) the user has audited: the size of `listUserHistory`. */
export async function countUserSites(db: Db, userId: string): Promise<number> {
	const [row] = await db
		.select({ total: countDistinct(audits.url) })
		.from(audits)
		.where(eq(audits.userId, userId));
	return row?.total ?? 0;
}

export interface AdminAuditRow {
	id: string;
	url: string;
	host: string;
	mode: AuditMode;
	status: AuditStatus;
	score: number | null;
	grade: string | null;
	error: string | null;
	createdAt: Date;
	finishedAt: Date | null;
	userEmail: string | null;
}

/** The admin list's filters: a status, and a substring of the URL or the owner's email. */
export interface AdminAuditFilter {
	status?: AuditStatus;
	/** Matched case-insensitively and literally (`%` and `_` are not wildcards). */
	search?: string;
}

function adminAuditWhere({ status, search }: AdminAuditFilter) {
	const pattern = search ? containsPattern(search) : undefined;
	return and(
		status ? eq(audits.status, status) : undefined,
		pattern
			? or(ilike(audits.url, pattern), ilike(users.email, pattern))
			: undefined,
	);
}

/** All audits with the owner's email (null for anonymous), newest first (default limit 100). */
export async function listAudits(
	db: Db,
	opts: AdminAuditFilter & { limit?: number; offset?: number } = {},
): Promise<AdminAuditRow[]> {
	return db
		.select({
			id: audits.id,
			url: audits.url,
			host: audits.host,
			mode: audits.mode,
			status: audits.status,
			score: audits.score,
			grade: audits.grade,
			error: audits.error,
			createdAt: audits.createdAt,
			finishedAt: audits.finishedAt,
			userEmail: users.email,
		})
		.from(audits)
		.leftJoin(users, eq(audits.userId, users.id))
		.where(adminAuditWhere(opts))
		.orderBy(desc(audits.createdAt))
		.limit(opts.limit ?? 100)
		.offset(opts.offset ?? 0);
}

/** How many audits `listAudits` can return for the same filter. */
export async function countAudits(
	db: Db,
	filter: AdminAuditFilter = {},
): Promise<number> {
	const [row] = await db
		.select({ total: count() })
		.from(audits)
		.leftJoin(users, eq(audits.userId, users.id))
		.where(adminAuditWhere(filter));
	return row?.total ?? 0;
}
