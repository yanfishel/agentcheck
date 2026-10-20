import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import {
	type DrizzleTransactionLike,
	fromDrizzle,
	fromPglite,
	type PGliteLike,
	PgBoss,
} from "pg-boss";
import { type Db, DEFAULT_CONNECTION_TIMEOUT_MS } from "./client.ts";
import type { Audit, AuditMode } from "./schema.ts";

export const AUDIT_QUEUE = "audit";
/** Jobs that exhausted their retries land here; the worker fails their audit. */
export const AUDIT_DEAD_QUEUE = "audit_dead";
export const FIX_FILES_QUEUE = "fix_files";
/** Fix-files jobs that exhausted their retries land here, apart from audits. */
export const FIX_FILES_DEAD_QUEUE = "fix_files_dead";
export const MAINTENANCE_QUEUE = "maintenance";
/** pg-boss's schema (its default), set explicitly because the sweep reads it. */
export const PGBOSS_SCHEMA = "pgboss";

export type MaintenanceTask = "sweep" | "retention";

/** Cron expressions (UTC) for the maintenance jobs the worker schedules. */
export const MAINTENANCE_SCHEDULES: Record<MaintenanceTask, string> = {
	sweep: "*/5 * * * *",
	retention: "0 3 * * *",
};

const isMaintenanceTask = (task: unknown): task is MaintenanceTask =>
	typeof task === "string" && Object.hasOwn(MAINTENANCE_SCHEDULES, task);

/** pg-boss fetches higher priorities first, so quick audits jump the queue. */
export const AUDIT_JOB_PRIORITY: Record<AuditMode, number> = {
	quick: 10,
	full: 0,
};

export interface AuditJobData {
	auditId: string;
}

/**
 * Validates a job payload and returns a fresh `{ auditId }`; every other
 * field is dropped so nothing else in the payload can steer the worker.
 */
export function parseAuditJobData(data: unknown): AuditJobData {
	if (typeof data === "object" && data !== null && "auditId" in data) {
		const { auditId } = data;
		if (typeof auditId === "string" && auditId !== "") return { auditId };
	}
	throw new Error("Invalid audit job data");
}

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a fix-files job payload and returns a fresh `{ auditId }`; every
 * other field is dropped.
 */
export function parseFixFilesJobData(data: unknown): AuditJobData {
	if (typeof data === "object" && data !== null && "auditId" in data) {
		const { auditId } = data;
		if (typeof auditId === "string" && UUID_RE.test(auditId)) {
			return { auditId };
		}
	}
	throw new Error("Invalid fix files job data");
}

/** Validates a maintenance job payload and returns a fresh `{ task }`. */
export function parseMaintenanceJobData(data: unknown): {
	task: MaintenanceTask;
} {
	if (typeof data === "object" && data !== null && "task" in data) {
		const { task } = data;
		if (isMaintenanceTask(task)) return { task };
	}
	throw new Error("Invalid maintenance job data");
}

export type QueueTarget =
	| { connectionString: string; max?: number; connectionTimeoutMs?: number }
	| { pglite: PGliteLike };

export interface QueueHandle {
	boss: PgBoss;
	stop(): Promise<void>;
}

const DEFAULT_STOP_TIMEOUT_MS = 30_000;
const FAILED_START_STOP_TIMEOUT_MS = 1000;

/**
 * Starts pg-boss (installing its schema if needed) and ensures the queues
 * exist. The web app runs it with `supervise: false`, the worker with
 * `supervise: true, schedule: true` (only the worker fires cron schedules).
 */
export async function startQueue(
	target: QueueTarget,
	opts: {
		supervise: boolean;
		schedule?: boolean;
		onError?: (error: Error) => void;
		stopTimeoutMs?: number;
	},
): Promise<QueueHandle> {
	const connection =
		"pglite" in target
			? { db: fromPglite(target.pglite), backend: "pglite" as const }
			: {
					connectionString: target.connectionString,
					max: target.max,
					connectionTimeoutMillis:
						target.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
					backend: "postgres" as const,
				};
	const boss = new PgBoss({
		...connection,
		schema: PGBOSS_SCHEMA,
		supervise: opts.supervise,
		schedule: opts.schedule ?? false,
	});
	boss.on("error", opts.onError ?? console.error);
	try {
		await boss.start();
		// The dead-letter queue must exist before a queue can point at it.
		await boss.createQueue(AUDIT_DEAD_QUEUE, { retryLimit: 1 });
		await boss.createQueue(AUDIT_QUEUE, {
			retryLimit: 1,
			retryDelay: 5,
			expireInSeconds: 120,
			deadLetter: AUDIT_DEAD_QUEUE,
		});
		// createQueue leaves an existing queue untouched, so a database whose
		// audit queue predates the dead-letter queue is updated here.
		await boss.updateQueue(AUDIT_QUEUE, { deadLetter: AUDIT_DEAD_QUEUE });
		await boss.createQueue(FIX_FILES_DEAD_QUEUE, { retryLimit: 1 });
		await boss.createQueue(FIX_FILES_QUEUE, {
			retryLimit: 1,
			retryDelay: 5,
			expireInSeconds: 90,
			deadLetter: FIX_FILES_DEAD_QUEUE,
		});
		await boss.updateQueue(FIX_FILES_QUEUE, {
			deadLetter: FIX_FILES_DEAD_QUEUE,
		});
		await boss.createQueue(MAINTENANCE_QUEUE, {
			retryLimit: 0,
			expireInSeconds: 300,
		});
	} catch (error) {
		// Release the pool and timers a half-started instance may hold; callers
		// such as the web app retry on the next request.
		await boss
			.stop({ graceful: false, timeout: FAILED_START_STOP_TIMEOUT_MS })
			.catch(() => {});
		throw error;
	}
	const timeout = opts.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
	return {
		boss,
		stop: () => boss.stop({ graceful: true, timeout }),
	};
}

/**
 * `Db` is generic over the query result, so its `execute` is typed as
 * `unknown`; both node-postgres and PGlite resolve it to `{ rows }`, which is
 * what pg-boss's Drizzle adapter reads.
 */
const asDrizzleTransaction = (tx: Db) =>
	tx as unknown as DrizzleTransactionLike;

/**
 * SQL condition: `auditId` has a job on `queue` that pg-boss will still run
 * or is running (state `created`, `retry` or `active`). `auditId` must be a
 * table-qualified column, since the subquery has its own `id`.
 */
export function hasLiveJob(queue: string, auditId: SQLWrapper): SQL {
	return sql`exists (select 1 from ${sql.identifier(PGBOSS_SCHEMA)}.job as live_job where live_job.name = ${queue} and live_job.data->>'auditId' = (${auditId})::text and live_job.state in ('created', 'retry', 'active'))`;
}

/** Sends the audit job inside `tx`, so it only exists if the audit commits. */
export async function enqueueAudit(
	boss: PgBoss,
	tx: Db,
	audit: Pick<Audit, "id" | "mode">,
): Promise<void> {
	await boss.send(AUDIT_QUEUE, { auditId: audit.id } satisfies AuditJobData, {
		priority: AUDIT_JOB_PRIORITY[audit.mode],
		db: fromDrizzle(asDrizzleTransaction(tx), sql),
	});
}

/** Sends the audit job again after `delaySeconds` (e.g. its host is busy). */
export async function requeueAudit(
	boss: PgBoss,
	audit: Pick<Audit, "id" | "mode">,
	delaySeconds: number,
): Promise<void> {
	await boss.send(AUDIT_QUEUE, { auditId: audit.id } satisfies AuditJobData, {
		priority: AUDIT_JOB_PRIORITY[audit.mode],
		startAfter: delaySeconds,
	});
}

/** Sends the fix-files job inside `tx`, so it only exists if the row commits. */
export async function enqueueFixFiles(
	boss: PgBoss,
	tx: Db,
	auditId: string,
): Promise<void> {
	await boss.send(FIX_FILES_QUEUE, { auditId } satisfies AuditJobData, {
		db: fromDrizzle(asDrizzleTransaction(tx), sql),
	});
}

/** Sends the fix-files job again after `delaySeconds` (e.g. its host is busy). */
export async function requeueFixFiles(
	boss: PgBoss,
	auditId: string,
	delaySeconds: number,
): Promise<void> {
	await boss.send(FIX_FILES_QUEUE, { auditId } satisfies AuditJobData, {
		startAfter: delaySeconds,
	});
}

/** Upserts the maintenance cron schedules (keyed by task, so idempotent). */
export async function scheduleMaintenance(boss: PgBoss): Promise<void> {
	for (const [task, cron] of Object.entries(MAINTENANCE_SCHEDULES)) {
		await boss.schedule(
			MAINTENANCE_QUEUE,
			cron,
			{ task },
			{ key: task, tz: "UTC" },
		);
	}
}
