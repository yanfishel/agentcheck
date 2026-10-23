import {
	type AuditOptions,
	type AuditResult,
	defaultUserAgent,
	type Favicon,
	type FinishedCheck,
	type GuardedAuditOptionsInput,
	guardedAuditOptions,
	runAudit,
	type Screenshot,
} from "@agentcheck/core";
import { parseAuditJobData } from "@agentcheck/db";
import type { AuditStore } from "./audit-store.ts";
import type { Logger } from "./log.ts";
import { WORKER_VERSION } from "./version.ts";

export const AUDIT_TIMEOUT_MS = 90_000;
export const TIMEOUT_ERROR = "Audit timed out";
export const INTERNAL_ERROR = "Internal error";

export interface ProcessDeps {
	store: AuditStore;
	/** Defaults to runAudit; tests inject fakes. */
	audit?: (target: string, opts: AuditOptions) => Promise<AuditResult>;
	/**
	 * @internal Tests only; production must leave this unset so options come
	 * from guardedAuditOptions.
	 */
	auditOptions?: (input: GuardedAuditOptionsInput) => AuditOptions;
	/** Defaults to AUDIT_TIMEOUT_MS. */
	timeoutMs?: number;
	log?: Logger;
}

/** Delay before a job whose host is at its running cap is tried again. */
export const BUSY_REQUEUE_SECONDS = 5;

export type ProcessOutcome = "done" | "failed" | "skipped" | "requeued";

const noLog: Logger = () => {};

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

type RaceResult =
	| { kind: "result"; result: AuditResult }
	| { kind: "error"; error: unknown }
	| { kind: "timeout" };

/**
 * Runs one audit job. Audit errors and timeouts are recorded as a failed
 * audit; only store errors (infrastructure) propagate, so pg-boss retries.
 * `jobId` (the pg-boss job id) is recorded by the claim; a row another job
 * has claimed is reported `taken` and skipped.
 */
export async function processAudit(
	deps: ProcessDeps,
	data: unknown,
	jobId: string,
): Promise<ProcessOutcome> {
	const { store } = deps;
	const audit = deps.audit ?? runAudit;
	const buildOptions = deps.auditOptions ?? guardedAuditOptions;
	const timeoutMs = deps.timeoutMs ?? AUDIT_TIMEOUT_MS;
	const log = deps.log ?? noLog;

	const { auditId } = parseAuditJobData(data);
	const claim = await store.claim(auditId, jobId);
	if (claim.kind === "busy") {
		await store.requeue(
			{ id: auditId, mode: claim.mode },
			BUSY_REQUEUE_SECONDS,
		);
		log("info", "audit.requeued", { auditId, host: claim.host });
		return "requeued";
	}
	if (claim.kind !== "claimed") {
		log("info", "audit.skipped", { auditId, reason: claim.kind });
		return "skipped";
	}
	const row = claim.audit;
	log("info", "audit.started", { auditId, mode: row.mode, url: row.url });
	const started = performance.now();

	// Partial data is best effort: a failed write is logged, never awaited,
	// and neither fails the audit nor reaches the engine.
	const partial = (write: Promise<boolean>, what: string) => {
		write.catch((error: unknown) => {
			log("warn", "audit.partial_error", {
				auditId,
				what,
				error: errorMessage(error),
			});
		});
	};

	// Only the guard's options: nothing from the job payload or the row
	// except the target URL and the mode reaches runAudit.
	// The first-screen shot is kept only for full audits and stored with the
	// result; a timed-out or failed audit never reads it. A full audit also
	// crawls the site (SERVICE_CRAWL, fixed in the engine).
	let screenshot: Screenshot | undefined;
	let favicon: Favicon | undefined;
	const full = row.mode === "full";
	const opts: AuditOptions = buildOptions({
		userAgent: defaultUserAgent(WORKER_VERSION),
		toolVersion: WORKER_VERSION,
		browser: full,
		crawl: full,
		onCheck: (check: FinishedCheck) => {
			partial(store.recordCheck(auditId, jobId, check), check.id);
		},
		onFavicon: (icon: Favicon) => {
			favicon = icon;
			partial(store.saveFavicon(auditId, jobId, icon), "favicon");
		},
		...(full && {
			onScreenshot: (shot: Screenshot) => {
				screenshot = shot;
			},
		}),
	});

	// runAudit cannot be aborted: on timeout its late outcome is discarded.
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<RaceResult>((resolve) => {
		timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
	});
	const run = Promise.resolve()
		.then(() => audit(row.url, opts))
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
		await store.fail(auditId, TIMEOUT_ERROR);
		log("warn", "audit.timeout", { auditId, timeoutMs });
		return "failed";
	}
	if (outcome.kind === "error") {
		const message = errorMessage(outcome.error);
		await store.fail(auditId, message);
		log("warn", "audit.failed", { auditId, error: message });
		return "failed";
	}
	const { result } = outcome;
	// The headline: a crawl's site score, else the page's.
	const headline = result.crawl ?? result;
	await store.complete(auditId, {
		result,
		finalUrl: result.finalUrl,
		score: headline.score,
		grade: headline.grade,
		screenshot,
		favicon,
	});
	log("info", "audit.done", {
		auditId,
		durationMs: Math.round(performance.now() - started),
		score: headline.score,
		grade: headline.grade,
	});
	return "done";
}

/**
 * pg-boss handler body. On the last attempt an infrastructure error also
 * marks the audit failed (best effort) so it does not stay `running`.
 */
export async function runJob(
	deps: ProcessDeps,
	job: { id: string; data: unknown; retryCount: number; retryLimit: number },
): Promise<ProcessOutcome> {
	try {
		return await processAudit(deps, job.data, job.id);
	} catch (error) {
		const log = deps.log ?? noLog;
		const lastAttempt = job.retryCount >= job.retryLimit;
		log("error", "audit.error", {
			error: errorMessage(error),
			retryCount: job.retryCount,
			lastAttempt,
		});
		if (lastAttempt) {
			// Without a valid id there is nothing to mark; keep the original error.
			let auditId: string;
			try {
				auditId = parseAuditJobData(job.data).auditId;
			} catch {
				throw error;
			}
			try {
				await deps.store.fail(auditId, INTERNAL_ERROR);
			} catch (failError) {
				log("error", "audit.fail_error", {
					auditId,
					error: errorMessage(failError),
				});
			}
		}
		throw error;
	}
}
