import { defaultUserAgent } from "@agentcheck/core";
import {
	type FixFiles,
	type FixOptions,
	generateFixFiles,
	guardedFixOptions,
} from "@agentcheck/core/fixes";
import { parseFixFilesJobData } from "@agentcheck/db";
import type { FixFilesStore } from "./fix-files-store.ts";
import type { Logger } from "./log.ts";
import {
	BUSY_REQUEUE_SECONDS,
	INTERNAL_ERROR,
	type ProcessOutcome,
} from "./process-audit.ts";
import { WORKER_VERSION } from "./version.ts";

export const FIX_FILES_TIMEOUT_MS = 60_000;
export const FIX_FILES_TIMEOUT_ERROR = "Fix files timed out";
/** Progress is written to the row at most this often. */
const PROGRESS_INTERVAL_MS = 1000;

export interface FixDeps {
	store: FixFilesStore;
	/** Defaults to generateFixFiles; tests inject fakes. */
	generate?: typeof generateFixFiles;
	/**
	 * @internal Tests only; production must leave this unset so options come
	 * from guardedFixOptions.
	 */
	fixOptions?: typeof guardedFixOptions;
	/** Defaults to FIX_FILES_TIMEOUT_MS. */
	timeoutMs?: number;
	/** Milliseconds clock for the progress throttle; defaults to Date.now. */
	now?: () => number;
	log?: Logger;
}

const noLog: Logger = () => {};

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

type RaceResult =
	| { kind: "result"; result: FixFiles }
	| { kind: "error"; error: unknown }
	| { kind: "timeout" };

/**
 * Runs one fix-files job. Generator errors and timeouts are recorded as a
 * failed row; only store errors (infrastructure) propagate, so pg-boss retries.
 * `jobId` (the pg-boss job id) is recorded by the claim; a row another job
 * has claimed is reported `taken` and skipped.
 */
export async function processFixFiles(
	deps: FixDeps,
	data: unknown,
	jobId: string,
): Promise<ProcessOutcome> {
	const { store } = deps;
	const generate = deps.generate ?? generateFixFiles;
	const buildOptions = deps.fixOptions ?? guardedFixOptions;
	const timeoutMs = deps.timeoutMs ?? FIX_FILES_TIMEOUT_MS;
	const now = deps.now ?? Date.now;
	const log = deps.log ?? noLog;

	const { auditId } = parseFixFilesJobData(data);
	const claim = await store.claim(auditId, jobId);
	if (claim.kind === "busy") {
		await store.requeue(auditId, BUSY_REQUEUE_SECONDS);
		log("info", "fix_files.requeued", { auditId, host: claim.host });
		return "requeued";
	}
	if (claim.kind !== "claimed") {
		log("info", "fix_files.skipped", { auditId, reason: claim.kind });
		return "skipped";
	}
	log("info", "fix_files.started", {
		auditId,
		url: claim.url,
		kinds: claim.kinds,
	});
	const started = performance.now();

	const controller = new AbortController();
	let lastProgress: number | undefined;
	// Only the guard's options plus the signal and the progress callback:
	// nothing from the job payload or the row except the URL and the kinds.
	const opts: FixOptions = {
		...buildOptions({
			userAgent: defaultUserAgent(WORKER_VERSION),
			toolVersion: WORKER_VERSION,
		}),
		signal: controller.signal,
		onProgress: (read, planned) => {
			const at = now();
			if (
				lastProgress !== undefined &&
				at - lastProgress < PROGRESS_INTERVAL_MS
			) {
				return;
			}
			lastProgress = at;
			// Best effort: a lost progress write must not fail the job.
			store.progress(auditId, read, planned).catch((error: unknown) => {
				log("warn", "fix_files.progress_error", {
					auditId,
					error: errorMessage(error),
				});
			});
		},
	};

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<RaceResult>((resolve) => {
		timer = setTimeout(() => {
			controller.abort();
			resolve({ kind: "timeout" });
		}, timeoutMs);
	});
	const run = Promise.resolve()
		.then(() => generate({ url: claim.url, kinds: claim.kinds }, opts))
		.then(
			(result): RaceResult => ({ kind: "result", result }),
			(error: unknown): RaceResult => ({ kind: "error", error }),
		);
	let outcome: RaceResult;
	try {
		outcome = await Promise.race([run, timeout]);
	} finally {
		clearTimeout(timer);
	}

	if (outcome.kind === "timeout") {
		await store.fail(auditId, FIX_FILES_TIMEOUT_ERROR);
		log("warn", "fix_files.timeout", { auditId, timeoutMs });
		return "failed";
	}
	if (outcome.kind === "error") {
		const message = errorMessage(outcome.error);
		await store.fail(auditId, message);
		log("warn", "fix_files.failed", { auditId, error: message });
		return "failed";
	}
	const stored = await store.complete(auditId, outcome.result);
	log("info", "fix_files.done", {
		auditId,
		stored,
		durationMs: Math.round(performance.now() - started),
	});
	return "done";
}

/**
 * pg-boss handler body. On the last attempt an infrastructure error also
 * marks the row failed (best effort) so it does not stay `running`.
 */
export async function runFixFilesJob(
	deps: FixDeps,
	job: { id: string; data: unknown; retryCount: number; retryLimit: number },
): Promise<void> {
	try {
		await processFixFiles(deps, job.data, job.id);
	} catch (error) {
		const log = deps.log ?? noLog;
		const lastAttempt = job.retryCount >= job.retryLimit;
		log("error", "fix_files.error", {
			error: errorMessage(error),
			retryCount: job.retryCount,
			lastAttempt,
		});
		if (lastAttempt) {
			// Without a valid id there is nothing to mark; keep the original error.
			let auditId: string;
			try {
				auditId = parseFixFilesJobData(job.data).auditId;
			} catch {
				throw error;
			}
			try {
				await deps.store.fail(auditId, INTERNAL_ERROR);
			} catch (failError) {
				log("error", "fix_files.fail_error", {
					auditId,
					error: errorMessage(failError),
				});
			}
		}
		throw error;
	}
}

/**
 * Handles a fix-files job that exhausted its retries: marks the row failed so
 * it does not stay queued or running. Finished rows are left unchanged.
 */
export async function runFixFilesDeadLetter(
	deps: { store: Pick<FixFilesStore, "fail">; log?: Logger },
	data: unknown,
): Promise<boolean> {
	const { auditId } = parseFixFilesJobData(data);
	const failed = await deps.store.fail(auditId, INTERNAL_ERROR);
	(deps.log ?? noLog)("warn", "fix_files.dead_letter", { auditId, failed });
	return failed;
}
