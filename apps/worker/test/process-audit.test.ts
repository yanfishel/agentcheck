import {
	type AuditOptions,
	type AuditResult,
	defaultUserAgent,
	type Favicon,
	type GuardedAuditOptionsInput,
	guardedAuditOptions,
	type Screenshot,
	TargetUnreachableError,
} from "@agentcheck/core";
import type { Audit, AuditMode, ClaimResult } from "@agentcheck/db";
import { describe, expect, it, vi } from "vitest";
import type { AuditStore } from "../src/audit-store.ts";
import type { Logger } from "../src/log.ts";
import {
	BUSY_REQUEUE_SECONDS,
	INTERNAL_ERROR,
	type ProcessDeps,
	processAudit,
	runJob,
	TIMEOUT_ERROR,
} from "../src/process-audit.ts";
import { WORKER_VERSION } from "../src/version.ts";

const ID = "00000000-0000-4000-8000-000000000001";
const URL_ = "https://example.com/";
const JOB_ID = "job-1";

function auditRow(mode: AuditMode): Audit {
	return {
		id: ID,
		userId: null,
		ipHash: null,
		url: URL_,
		finalUrl: null,
		host: "example.com",
		mode,
		status: "running",
		result: null,
		score: null,
		grade: null,
		error: null,
		shareToken: null,
		hasScreenshot: false,
		hasFavicon: false,
		createdAt: new Date(0),
		startedAt: new Date(0),
		finishedAt: null,
		queuedAt: new Date(0),
		claimedBy: JOB_ID,
	};
}

const RESULT: AuditResult = {
	tool: { name: "agentcheck", version: WORKER_VERSION },
	target: URL_,
	finalUrl: "https://example.com/home",
	timestamp: "2026-10-19T00:00:00.000Z",
	categories: [],
	score: 87,
	grade: "A",
	browser: { used: false, reason: "disabled" },
};

interface FakeStore extends AuditStore {
	completed: Array<{ id: string; data: unknown }>;
	failed: Array<{ id: string; error: string }>;
	requeued: Array<{ audit: Pick<Audit, "id" | "mode">; delaySeconds: number }>;
	claims: Array<{ id: string; jobId: string }>;
}

function fakeStore(
	claim: ClaimResult | (() => Promise<ClaimResult>) = {
		kind: "claimed",
		audit: auditRow("quick"),
	},
): FakeStore {
	const store: FakeStore = {
		completed: [],
		failed: [],
		requeued: [],
		claims: [],
		claim: async (id, jobId) => {
			store.claims.push({ id, jobId });
			return typeof claim === "function" ? claim() : claim;
		},
		complete: async (id, data) => {
			store.completed.push({ id, data });
			return true;
		},
		fail: async (id, error) => {
			store.failed.push({ id, error });
			return true;
		},
		requeue: async (audit, delaySeconds) => {
			store.requeued.push({ audit, delaySeconds });
		},
	};
	return store;
}

const silent = () => {};

const fakeAudit = () => vi.fn(async (_t: string, _o: AuditOptions) => RESULT);

function deps(
	store: AuditStore,
	overrides: Partial<ProcessDeps> = {},
): ProcessDeps {
	return { store, audit: fakeAudit(), log: silent, ...overrides };
}

describe("processAudit", () => {
	it("builds the audit options only with guardedAuditOptions", async () => {
		const audit = fakeAudit();
		await processAudit(
			deps(fakeStore(), { audit }),
			{
				auditId: ID,
				network: { blockPrivate: false },
				dispatcher: {},
				renderer: {},
				userAgent: "x",
			},
			JOB_ID,
		);
		expect(audit).toHaveBeenCalledTimes(1);
		const [target, opts] = audit.mock.calls[0] ?? [];
		expect(target).toBe(URL_);
		if (!opts) throw new Error("no options");
		expect(Object.keys(opts).sort()).toEqual([
			"network",
			"onFavicon",
			"renderer",
			"toolVersion",
			"userAgent",
		]);
		expect(opts.network).toEqual({ blockPrivate: true });
		expect(opts.renderer?.disabled).toBe(true);
		expect(opts.userAgent).toBe(defaultUserAgent(WORKER_VERSION));
		expect(opts.toolVersion).toBe(WORKER_VERSION);
	});

	it("uses the guarded browser renderer for full audits", async () => {
		const store = fakeStore({ kind: "claimed", audit: auditRow("full") });
		const audit = fakeAudit();
		await processAudit(deps(store, { audit }), { auditId: ID }, JOB_ID);
		const opts = audit.mock.calls[0]?.[1];
		expect(opts?.renderer?.guarded).toBe(true);
		expect(opts?.network).toEqual({ blockPrivate: true });
	});

	it("stores the screenshot a full audit captured", async () => {
		const shot: Screenshot = {
			contentType: "image/webp",
			large: new Uint8Array([1]),
			small: new Uint8Array([2]),
		};
		const store = fakeStore({ kind: "claimed", audit: auditRow("full") });
		const auditOptions = vi.fn((input: GuardedAuditOptionsInput) => {
			input.onScreenshot?.(shot);
			return guardedAuditOptions(input);
		});
		await processAudit(deps(store, { auditOptions }), { auditId: ID }, JOB_ID);
		expect(store.completed[0]?.data).toMatchObject({ screenshot: shot });
	});

	it("pins the output keys of guardedAuditOptions for a full audit", async () => {
		const store = fakeStore({ kind: "claimed", audit: auditRow("full") });
		const audit = fakeAudit();
		await processAudit(deps(store, { audit }), { auditId: ID }, JOB_ID);
		const opts = audit.mock.calls[0]?.[1];
		if (!opts) throw new Error("no options");
		expect(Object.keys(opts).sort()).toEqual([
			"network",
			"onFavicon",
			"renderer",
			"toolVersion",
			"userAgent",
		]);
	});

	it("stores the favicon of a quick audit", async () => {
		const icon: Favicon = {
			contentType: "image/png",
			body: new Uint8Array([5]),
		};
		const store = fakeStore();
		const auditOptions = vi.fn((input: GuardedAuditOptionsInput) => {
			input.onFavicon?.(icon);
			return guardedAuditOptions(input);
		});
		await processAudit(deps(store, { auditOptions }), { auditId: ID }, JOB_ID);
		expect(store.completed[0]?.data).toMatchObject({ favicon: icon });
	});

	it("stores the favicon of a full audit", async () => {
		const icon: Favicon = {
			contentType: "image/png",
			body: new Uint8Array([5]),
		};
		const store = fakeStore({ kind: "claimed", audit: auditRow("full") });
		const auditOptions = vi.fn((input: GuardedAuditOptionsInput) => {
			input.onFavicon?.(icon);
			return guardedAuditOptions(input);
		});
		await processAudit(deps(store, { auditOptions }), { auditId: ID }, JOB_ID);
		expect(store.completed[0]?.data).toMatchObject({ favicon: icon });
	});

	it("never asks a quick audit for a screenshot", async () => {
		const auditOptions = vi.fn((input: GuardedAuditOptionsInput) =>
			guardedAuditOptions(input),
		);
		await processAudit(
			deps(fakeStore(), { auditOptions }),
			{ auditId: ID },
			JOB_ID,
		);
		const input = auditOptions.mock.calls[0]?.[0];
		expect(input?.browser).toBe(false);
		expect(input?.onScreenshot).toBeUndefined();
	});

	it("stores no screenshot for a timed-out audit", async () => {
		const shot: Screenshot = {
			contentType: "image/webp",
			large: new Uint8Array([1]),
			small: new Uint8Array([2]),
		};
		const store = fakeStore({ kind: "claimed", audit: auditRow("full") });
		const auditOptions = (input: GuardedAuditOptionsInput) => {
			input.onScreenshot?.(shot);
			return guardedAuditOptions(input);
		};
		await processAudit(
			deps(store, {
				auditOptions,
				timeoutMs: 5,
				audit: () => new Promise<AuditResult>(() => {}),
			}),
			{ auditId: ID },
			JOB_ID,
		);
		expect(store.completed).toEqual([]);
		expect(store.failed).toHaveLength(1);
	});

	it("stores the result", async () => {
		const store = fakeStore();
		await expect(
			processAudit(deps(store), { auditId: ID }, JOB_ID),
		).resolves.toBe("done");
		expect(store.completed).toEqual([
			{
				id: ID,
				data: {
					result: RESULT,
					finalUrl: RESULT.finalUrl,
					score: RESULT.score,
					grade: RESULT.grade,
				},
			},
		]);
		expect(store.failed).toEqual([]);
	});

	it("records an audit error as a failure", async () => {
		const store = fakeStore();
		const d = deps(store, {
			audit: async () => {
				throw new TargetUnreachableError("Could not reach https://x/");
			},
		});
		await expect(processAudit(d, { auditId: ID }, JOB_ID)).resolves.toBe(
			"failed",
		);
		expect(store.failed).toEqual([
			{ id: ID, error: "Could not reach https://x/" },
		]);
		expect(store.completed).toEqual([]);
	});

	it("fails a timed out audit and ignores its late result", async () => {
		const store = fakeStore();
		let lateResolved = false;
		const d = deps(store, {
			timeoutMs: 20,
			audit: () =>
				new Promise<AuditResult>((resolve) =>
					setTimeout(() => {
						lateResolved = true;
						resolve(RESULT);
					}, 100),
				),
		});
		await expect(processAudit(d, { auditId: ID }, JOB_ID)).resolves.toBe(
			"failed",
		);
		expect(store.failed).toEqual([{ id: ID, error: TIMEOUT_ERROR }]);
		await vi.waitFor(() => expect(lateResolved).toBe(true));
		await new Promise((resolve) => setImmediate(resolve));
		expect(store.completed).toEqual([]);
		expect(store.failed).toHaveLength(1);
	});

	it.each<ClaimResult>([
		{ kind: "finished", status: "done" },
		{ kind: "missing" },
	])("skips an audit when the claim is $kind", async (claim) => {
		const store = fakeStore(claim);
		const audit = fakeAudit();
		await expect(
			processAudit(deps(store, { audit }), { auditId: ID }, JOB_ID),
		).resolves.toBe("skipped");
		expect(audit).not.toHaveBeenCalled();
		expect(store.completed).toEqual([]);
		expect(store.failed).toEqual([]);
	});

	it("requeues an audit whose host is busy without running it", async () => {
		const store = fakeStore({
			kind: "busy",
			host: "example.com",
			mode: "full",
		});
		const audit = fakeAudit();
		const events: Array<{ event: string; fields?: Record<string, unknown> }> =
			[];
		const log: Logger = (_level, event, fields) => {
			events.push({ event, fields });
		};
		await expect(
			runJob(deps(store, { audit, log }), {
				id: JOB_ID,
				data: { auditId: ID },
				retryCount: 0,
				retryLimit: 1,
			}),
		).resolves.toBe("requeued");
		expect(BUSY_REQUEUE_SECONDS).toBe(5);
		expect(store.requeued).toEqual([
			{ audit: { id: ID, mode: "full" }, delaySeconds: 5 },
		]);
		expect(audit).not.toHaveBeenCalled();
		expect(store.completed).toEqual([]);
		expect(store.failed).toEqual([]);
		expect(events).toEqual([
			{
				event: "audit.requeued",
				fields: { auditId: ID, host: "example.com" },
			},
		]);
	});

	it("skips an audit another job has claimed, without requeueing it", async () => {
		const store = fakeStore({ kind: "taken" });
		const audit = fakeAudit();
		const events: Array<{ event: string; fields?: Record<string, unknown> }> =
			[];
		const log: Logger = (_level, event, fields) => {
			events.push({ event, fields });
		};
		await expect(
			processAudit(deps(store, { audit, log }), { auditId: ID }, JOB_ID),
		).resolves.toBe("skipped");
		expect(audit).not.toHaveBeenCalled();
		expect(store.requeued).toEqual([]);
		expect(store.completed).toEqual([]);
		expect(store.failed).toEqual([]);
		expect(events).toEqual([
			{ event: "audit.skipped", fields: { auditId: ID, reason: "taken" } },
		]);
	});

	it("claims with the pg-boss job id", async () => {
		const store = fakeStore();
		await runJob(deps(store), {
			id: "boss-job-42",
			data: { auditId: ID },
			retryCount: 0,
			retryLimit: 1,
		});
		expect(store.claims).toEqual([{ id: ID, jobId: "boss-job-42" }]);
	});

	it("propagates store errors", async () => {
		const boom = new Error("db down");
		const store = fakeStore(() => Promise.reject(boom));
		await expect(
			processAudit(deps(store), { auditId: ID }, JOB_ID),
		).rejects.toBe(boom);
	});
});

describe("processAudit logging", () => {
	const recorder = () => {
		const events: Array<{ event: string; fields?: Record<string, unknown> }> =
			[];
		const log: Logger = (_level, event, fields) => {
			events.push({ event, fields });
		};
		return { events, log };
	};

	it("logs audit.started then audit.done", async () => {
		const { events, log } = recorder();
		await processAudit(deps(fakeStore(), { log }), { auditId: ID }, JOB_ID);
		expect(events.map((e) => e.event)).toEqual(["audit.started", "audit.done"]);
		expect(events[0]?.fields).toMatchObject({
			auditId: ID,
			mode: "quick",
			url: URL_,
		});
		expect(events[1]?.fields).toMatchObject({
			auditId: ID,
			durationMs: expect.any(Number),
			score: RESULT.score,
			grade: RESULT.grade,
		});
	});

	it("logs audit.started then audit.timeout", async () => {
		const { events, log } = recorder();
		await processAudit(
			deps(fakeStore(), {
				log,
				timeoutMs: 20,
				audit: () =>
					new Promise<AuditResult>((resolve) =>
						setTimeout(() => resolve(RESULT), 100),
					),
			}),
			{ auditId: ID },
			JOB_ID,
		);
		expect(events.map((e) => e.event)).toEqual([
			"audit.started",
			"audit.timeout",
		]);
	});
});

describe("runJob", () => {
	const boom = new Error("db down");

	it("does not fail the audit before the last attempt", async () => {
		const store = fakeStore(() => Promise.reject(boom));
		await expect(
			runJob(deps(store), {
				id: JOB_ID,
				data: { auditId: ID },
				retryCount: 0,
				retryLimit: 1,
			}),
		).rejects.toBe(boom);
		expect(store.failed).toEqual([]);
	});

	it("fails the audit on the last attempt and rethrows", async () => {
		const store = fakeStore(() => Promise.reject(boom));
		await expect(
			runJob(deps(store), {
				id: JOB_ID,
				data: { auditId: ID },
				retryCount: 1,
				retryLimit: 1,
			}),
		).rejects.toBe(boom);
		expect(store.failed).toEqual([{ id: ID, error: INTERNAL_ERROR }]);
	});

	it("returns the outcome of a successful run", async () => {
		const store = fakeStore();
		await expect(
			runJob(deps(store), {
				id: JOB_ID,
				data: { auditId: ID },
				retryCount: 0,
				retryLimit: 1,
			}),
		).resolves.toBe("done");
	});
});
