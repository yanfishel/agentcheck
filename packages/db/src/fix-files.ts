import type { FixFiles, FixKind } from "@agentcheck/core/fixes";
import { and, eq, inArray, isNull, lt, ne, not, or, sql } from "drizzle-orm";
import { STALE_QUEUED_MS, STALE_RUNNING_MS } from "./audits.ts";
import type { Db } from "./client.ts";
import { FIX_FILES_QUEUE, hasLiveJob } from "./queue.ts";
import { type AuditFixFilesRow, auditFixFiles, audits } from "./schema.ts";

/** A done audit may start fix-file generation this many times at most. */
export const FIX_FILES_MAX_ATTEMPTS = 3;
const STALE_ERROR = "Fix files timed out";
const UNSCHEDULED_ERROR = "Fix files could not be scheduled";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID_RE.test(id);
const systemNow = () => new Date();

/**
 * Thrown by `createFixFiles` when a job cannot be started: `running` (queued
 * or running), `done` (never regenerated) or `attempts` (limit reached).
 */
export class FixFilesConflict extends Error {
	readonly reason: "running" | "done" | "attempts";
	constructor(reason: "running" | "done" | "attempts") {
		super(`Fix files conflict: ${reason}`);
		this.name = "FixFilesConflict";
		this.reason = reason;
	}
}

export type FixClaim =
	| { kind: "claimed"; url: string; kinds: FixKind[] }
	| { kind: "busy"; host: string }
	| { kind: "finished" }
	| { kind: "missing" }
	/** Running and claimed by another job, which owns it. */
	| { kind: "taken" };

/**
 * Inserts a queued row for the audit (or restarts a failed one, counting the
 * attempt) and hands it to `enqueue` inside the same transaction: if
 * `enqueue` throws, the change is rolled back. Throws `FixFilesConflict`
 * when a job is queued or running, when the files are done, or when the
 * attempt limit is reached.
 */
export async function createFixFiles(
	db: Db,
	auditId: string,
	kinds: FixKind[],
	enqueue: (tx: Db) => Promise<void>,
): Promise<AuditFixFilesRow> {
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`fixfiles:${auditId}`}))`,
		);
		const [existing] = await tx
			.select()
			.from(auditFixFiles)
			.where(eq(auditFixFiles.auditId, auditId))
			.limit(1);
		let row: AuditFixFilesRow | undefined;
		if (!existing) {
			[row] = await tx
				.insert(auditFixFiles)
				.values({ auditId, kinds })
				.returning();
		} else {
			if (existing.status === "done") throw new FixFilesConflict("done");
			if (existing.status !== "failed") throw new FixFilesConflict("running");
			if (existing.attempts >= FIX_FILES_MAX_ATTEMPTS) {
				throw new FixFilesConflict("attempts");
			}
			[row] = await tx
				.update(auditFixFiles)
				.set({
					kinds,
					status: "queued",
					attempts: existing.attempts + 1,
					progressRead: null,
					progressPlanned: null,
					result: null,
					error: null,
					startedAt: null,
					finishedAt: null,
					queuedAt: new Date(),
					claimedBy: null,
				})
				.where(
					and(
						eq(auditFixFiles.auditId, auditId),
						eq(auditFixFiles.status, "failed"),
					),
				)
				.returning();
		}
		if (!row) throw new Error("Failed to store the fix files job");
		await enqueue(tx);
		return row;
	});
}

/** The fix-files row of the audit, or `null`. */
export async function getFixFiles(
	db: Db,
	auditId: string,
): Promise<AuditFixFilesRow | null> {
	if (!isUuid(auditId)) return null;
	const [row] = await db
		.select()
		.from(auditFixFiles)
		.where(eq(auditFixFiles.auditId, auditId))
		.limit(1);
	return row ?? null;
}

/**
 * Moves a queued or running row to `running`, stamps `started_at` and
 * records `jobId` in `claimed_by`. A running row is claimed again only by the
 * job that claimed it (a retry after a crash) or, for rows claimed before
 * `claimed_by` existed, by any job; another job gets `taken`. A queued row
 * whose audit host already has another running fix job is reported `busy`
 * and stays queued with `queued_at` refreshed (one fix job per host at a
 * time).
 */
export async function claimFixFiles(
	db: Db,
	auditId: string,
	opts: { jobId: string; now?: () => Date },
): Promise<FixClaim> {
	if (!isUuid(auditId)) return { kind: "missing" };
	const now = opts.now ?? systemNow;
	const { jobId } = opts;
	return db.transaction(async (tx): Promise<FixClaim> => {
		const [row] = await tx
			.select({
				status: auditFixFiles.status,
				kinds: auditFixFiles.kinds,
				host: audits.host,
				url: audits.url,
				finalUrl: audits.finalUrl,
			})
			.from(auditFixFiles)
			.innerJoin(audits, eq(audits.id, auditFixFiles.auditId))
			.where(eq(auditFixFiles.auditId, auditId))
			.limit(1);
		if (!row) return { kind: "missing" };
		if (row.status === "done" || row.status === "failed") {
			return { kind: "finished" };
		}
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`host:${row.host}`}))`,
		);
		if (row.status === "queued") {
			const [running] = await tx
				.select({ id: auditFixFiles.auditId })
				.from(auditFixFiles)
				.innerJoin(audits, eq(audits.id, auditFixFiles.auditId))
				.where(
					and(
						eq(audits.host, row.host),
						eq(auditFixFiles.status, "running"),
						ne(auditFixFiles.auditId, auditId),
					),
				)
				.limit(1);
			if (running) {
				await tx
					.update(auditFixFiles)
					.set({ queuedAt: now() })
					.where(
						and(
							eq(auditFixFiles.auditId, auditId),
							eq(auditFixFiles.status, "queued"),
						),
					);
				return { kind: "busy", host: row.host };
			}
		}
		const updated = await tx
			.update(auditFixFiles)
			.set({ status: "running", startedAt: now(), claimedBy: jobId })
			.where(
				and(
					eq(auditFixFiles.auditId, auditId),
					or(
						eq(auditFixFiles.status, "queued"),
						and(
							eq(auditFixFiles.status, "running"),
							or(
								isNull(auditFixFiles.claimedBy),
								eq(auditFixFiles.claimedBy, jobId),
							),
						),
					),
				),
			)
			.returning({ id: auditFixFiles.auditId });
		if (updated.length === 1) {
			return {
				kind: "claimed",
				url: row.finalUrl ?? row.url,
				kinds: row.kinds,
			};
		}
		// Claimed by another job, or finished, between the read and the lock.
		const [after] = await tx
			.select({ status: auditFixFiles.status })
			.from(auditFixFiles)
			.where(eq(auditFixFiles.auditId, auditId))
			.limit(1);
		if (after?.status === "running") return { kind: "taken" };
		return { kind: "finished" };
	});
}

/** Records how many pages were read of those planned; only while running. */
export async function setFixFilesProgress(
	db: Db,
	auditId: string,
	read: number,
	planned: number,
): Promise<void> {
	if (!isUuid(auditId)) return;
	await db
		.update(auditFixFiles)
		.set({ progressRead: read, progressPlanned: planned })
		.where(
			and(
				eq(auditFixFiles.auditId, auditId),
				eq(auditFixFiles.status, "running"),
			),
		);
}

/**
 * Stores the generated files of a running row. Returns `false` (and changes
 * nothing) unless the row exists and is `running`.
 */
export async function completeFixFiles(
	db: Db,
	auditId: string,
	result: FixFiles,
	now: () => Date = systemNow,
): Promise<boolean> {
	if (!isUuid(auditId)) return false;
	const updated = await db
		.update(auditFixFiles)
		.set({ status: "done", result, error: null, finishedAt: now() })
		.where(
			and(
				eq(auditFixFiles.auditId, auditId),
				eq(auditFixFiles.status, "running"),
			),
		)
		.returning({ id: auditFixFiles.auditId });
	return updated.length === 1;
}

/**
 * Marks a queued or running row as failed. Returns `false` (and changes
 * nothing) for unknown or already finished rows.
 */
export async function failFixFiles(
	db: Db,
	auditId: string,
	error: string,
	now: () => Date = systemNow,
): Promise<boolean> {
	if (!isUuid(auditId)) return false;
	const updated = await db
		.update(auditFixFiles)
		.set({ status: "failed", error, finishedAt: now() })
		.where(
			and(
				eq(auditFixFiles.auditId, auditId),
				inArray(auditFixFiles.status, ["queued", "running"]),
			),
		)
		.returning({ id: auditFixFiles.auditId });
	return updated.length === 1;
}

/**
 * Fails rows stuck in `running` for longer than `STALE_RUNNING_MS` (their
 * worker died) and rows left `queued` for longer than `STALE_QUEUED_MS`
 * with no live pg-boss job (orphans). Returns how many were failed.
 */
export async function failStaleFixFiles(
	db: Db,
	now: () => Date = systemNow,
): Promise<number> {
	const at = now();
	const runningCutoff = new Date(at.getTime() - STALE_RUNNING_MS);
	const running = await db
		.update(auditFixFiles)
		.set({ status: "failed", error: STALE_ERROR, finishedAt: at })
		.where(
			and(
				eq(auditFixFiles.status, "running"),
				lt(auditFixFiles.startedAt, runningCutoff),
			),
		)
		.returning({ id: auditFixFiles.auditId });
	const queuedCutoff = new Date(at.getTime() - STALE_QUEUED_MS);
	const queued = await db
		.update(auditFixFiles)
		.set({ status: "failed", error: UNSCHEDULED_ERROR, finishedAt: at })
		.where(
			and(
				eq(auditFixFiles.status, "queued"),
				lt(auditFixFiles.queuedAt, queuedCutoff),
				not(
					hasLiveJob(
						FIX_FILES_QUEUE,
						sql`${sql.identifier("audit_fix_files")}.${sql.identifier("audit_id")}`,
					),
				),
			),
		)
		.returning({ id: auditFixFiles.auditId });
	return running.length + queued.length;
}
