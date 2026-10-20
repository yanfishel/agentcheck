import type { FixFiles } from "@agentcheck/core/fixes";
import {
	claimFixFiles,
	completeFixFiles,
	type Db,
	type FixClaim,
	failFixFiles,
	type PgBoss,
	requeueFixFiles,
	setFixFilesProgress,
} from "@agentcheck/db";

/** The fix-files row transitions the worker needs; faked in unit tests. */
export interface FixFilesStore {
	/** `jobId` is the pg-boss job id; only that job may reclaim a running row. */
	claim(id: string, jobId: string): Promise<FixClaim>;
	progress(id: string, read: number, planned: number): Promise<void>;
	complete(id: string, result: FixFiles): Promise<boolean>;
	fail(id: string, error: string): Promise<boolean>;
	requeue(id: string, delaySeconds: number): Promise<void>;
}

export function dbFixFilesStore(
	db: Db,
	boss: PgBoss,
	opts: { now?: () => Date } = {},
): FixFilesStore {
	const { now } = opts;
	return {
		claim: (id, jobId) => claimFixFiles(db, id, { jobId, now }),
		progress: (id, read, planned) => setFixFilesProgress(db, id, read, planned),
		complete: (id, result) => completeFixFiles(db, id, result, now),
		fail: (id, error) => failFixFiles(db, id, error, now),
		requeue: (id, delaySeconds) => requeueFixFiles(boss, id, delaySeconds),
	};
}
