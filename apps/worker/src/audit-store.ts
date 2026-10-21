import type {
	AuditResult,
	Favicon,
	FinishedCheck,
	Screenshot,
} from "@agentcheck/core";
import {
	type Audit,
	type ClaimResult,
	claimAudit,
	completeAudit,
	type Db,
	failAudit,
	getSettings,
	type PgBoss,
	recordAuditCheck,
	requeueAudit,
	saveAuditFavicon,
} from "@agentcheck/db";

/** The audit row transitions the worker needs; faked in unit tests. */
export interface AuditStore {
	/** `jobId` is the pg-boss job id; only that job may reclaim a running row. */
	claim(id: string, jobId: string): Promise<ClaimResult>;
	complete(
		id: string,
		data: {
			result: AuditResult;
			finalUrl: string;
			score: number;
			grade: string;
			screenshot?: Screenshot;
			favicon?: Favicon;
		},
	): Promise<boolean>;
	fail(id: string, error: string): Promise<boolean>;
	/** Stores one finished check while the row is running and claimed by `jobId`. */
	recordCheck(
		id: string,
		jobId: string,
		check: FinishedCheck,
	): Promise<boolean>;
	/** Stores the favicon early, under the same condition as `recordCheck`. */
	saveFavicon(id: string, jobId: string, icon: Favicon): Promise<boolean>;
	requeue(
		audit: Pick<Audit, "id" | "mode">,
		delaySeconds: number,
	): Promise<void>;
}

/**
 * `hostRunningMax` defaults to the admin setting, read on every claim (one
 * cheap row) so a change applies without restarting the worker.
 */
export function dbAuditStore(
	db: Db,
	boss: PgBoss,
	opts: { hostRunningMax?: () => Promise<number>; now?: () => Date } = {},
): AuditStore {
	const { now } = opts;
	const hostRunningMax =
		opts.hostRunningMax ?? (async () => (await getSettings(db)).hostRunningMax);
	return {
		claim: async (id, jobId) =>
			claimAudit(db, id, {
				jobId,
				hostRunningMax: await hostRunningMax(),
				now,
			}),
		complete: (id, data) => completeAudit(db, id, data, now),
		fail: (id, error) => failAudit(db, id, error, now),
		recordCheck: (id, jobId, check) => recordAuditCheck(db, id, jobId, check),
		saveFavicon: (id, jobId, icon) => saveAuditFavicon(db, id, jobId, icon),
		requeue: (audit, delaySeconds) => requeueAudit(boss, audit, delaySeconds),
	};
}
