import { defaultUserAgent } from "@agentcheck/core";
import type { FixFiles, FixOptions } from "@agentcheck/core/fixes";
import type { FixClaim } from "@agentcheck/db";
import { describe, expect, it, vi } from "vitest";
import type { FixFilesStore } from "../src/fix-files-store.ts";
import type { Logger } from "../src/log.ts";
import { INTERNAL_ERROR } from "../src/process-audit.ts";
import {
	type FixDeps,
	processFixFiles,
	runFixFilesDeadLetter,
	runFixFilesJob,
} from "../src/process-fix-files.ts";
import { WORKER_VERSION } from "../src/version.ts";

const ID = "00000000-0000-4000-8000-000000000001";
const URL_ = "https://example.com/home";
const JOB_ID = "job-1";

const RESULT: FixFiles = {
	files: [],
	todos: [],
	pagesRead: 0,
	pagesPlanned: 0,
} as unknown as FixFiles;

interface FakeStore extends FixFilesStore {
	completed: Array<{ id: string; result: FixFiles }>;
	failed: Array<{ id: string; error: string }>;
	requeued: Array<{ id: string; delaySeconds: number }>;
	progressed: Array<{ id: string; read: number; planned: number }>;
	claims: Array<{ id: string; jobId: string }>;
}

function fakeStore(
	claim: FixClaim = { kind: "claimed", url: URL_, kinds: ["robots", "llms"] },
): FakeStore {
	const store: FakeStore = {
		completed: [],
		failed: [],
		requeued: [],
		progressed: [],
		claims: [],
		claim: async (id, jobId) => {
			store.claims.push({ id, jobId });
			return claim;
		},
		progress: async (id, read, planned) => {
			store.progressed.push({ id, read, planned });
		},
		complete: async (id, result) => {
			store.completed.push({ id, result });
			return true;
		},
		fail: async (id, error) => {
			store.failed.push({ id, error });
			return true;
		},
		requeue: async (id, delaySeconds) => {
			store.requeued.push({ id, delaySeconds });
		},
	};
	return store;
}

const silent = () => {};
const fakeGenerate = () =>
	vi.fn(async (_input: unknown, _opts: FixOptions) => RESULT);

function deps(store: FixFilesStore, overrides: Partial<FixDeps> = {}): FixDeps {
	return { store, generate: fakeGenerate(), log: silent, ...overrides };
}

describe("processFixFiles", () => {
	it("passes only the guarded options", async () => {
		const generate = fakeGenerate();
		await processFixFiles(
			deps(fakeStore(), { generate }),
			{
				auditId: ID,
				url: "https://evil.example/",
				kinds: ["head"],
				network: { blockPrivate: false },
				dispatcher: {},
				userAgent: "x",
			},
			JOB_ID,
		);
		expect(generate).toHaveBeenCalledTimes(1);
		const [input, opts] = generate.mock.calls[0] ?? [];
		expect(input).toEqual({ url: URL_, kinds: ["robots", "llms"] });
		if (!opts) throw new Error("no options");
		expect(Object.keys(opts).sort()).toEqual([
			"network",
			"onProgress",
			"signal",
			"toolVersion",
			"userAgent",
		]);
		expect(opts.network).toEqual({ blockPrivate: true });
		expect(opts.userAgent).toBe(defaultUserAgent(WORKER_VERSION));
		expect(opts.toolVersion).toBe(WORKER_VERSION);
		expect(opts.signal?.aborted).toBe(false);
	});

	it("stores the result", async () => {
		const store = fakeStore();
		await expect(
			processFixFiles(deps(store), { auditId: ID }, JOB_ID),
		).resolves.toBe("done");
		expect(store.completed).toEqual([{ id: ID, result: RESULT }]);
		expect(store.failed).toEqual([]);
	});

	it("records a generator error as failed", async () => {
		const store = fakeStore();
		const generate = vi.fn(async () => {
			throw new Error("Could not read the page");
		});
		await expect(
			processFixFiles(deps(store, { generate }), { auditId: ID }, JOB_ID),
		).resolves.toBe("failed");
		expect(store.failed).toEqual([
			{ id: ID, error: "Could not read the page" },
		]);
		expect(store.completed).toEqual([]);
	});

	it("aborts at the timeout and fails with Fix files timed out", async () => {
		const store = fakeStore();
		let signal: AbortSignal | undefined;
		const generate = vi.fn(
			(_input: unknown, opts: FixOptions) =>
				new Promise<FixFiles>((_resolve, reject) => {
					signal = opts.signal;
					opts.signal?.addEventListener("abort", () =>
						reject(new Error("aborted")),
					);
				}),
		);
		await expect(
			processFixFiles(
				deps(store, { generate, timeoutMs: 20 }),
				{
					auditId: ID,
				},
				JOB_ID,
			),
		).resolves.toBe("failed");
		expect(signal?.aborted).toBe(true);
		expect(store.failed).toEqual([{ id: ID, error: "Fix files timed out" }]);
		expect(store.completed).toEqual([]);
	});

	it("requeues when busy after 5 s", async () => {
		const store = fakeStore({ kind: "busy", host: "example.com" });
		const generate = fakeGenerate();
		await expect(
			processFixFiles(deps(store, { generate }), { auditId: ID }, JOB_ID),
		).resolves.toBe("requeued");
		expect(store.requeued).toEqual([{ id: ID, delaySeconds: 5 }]);
		expect(generate).not.toHaveBeenCalled();
	});

	it.each(["finished", "missing"] as const)("skips %s", async (kind) => {
		const store = fakeStore({ kind });
		const generate = fakeGenerate();
		await expect(
			processFixFiles(deps(store, { generate }), { auditId: ID }, JOB_ID),
		).resolves.toBe("skipped");
		expect(generate).not.toHaveBeenCalled();
		expect(store.failed).toEqual([]);
	});

	it("skips a row another job has claimed, without requeueing it", async () => {
		const store = fakeStore({ kind: "taken" });
		const generate = fakeGenerate();
		const events: Array<{ event: string; fields?: Record<string, unknown> }> =
			[];
		const log: Logger = (_level, event, fields) => {
			events.push({ event, fields });
		};
		await expect(
			processFixFiles(deps(store, { generate, log }), { auditId: ID }, JOB_ID),
		).resolves.toBe("skipped");
		expect(generate).not.toHaveBeenCalled();
		expect(store.requeued).toEqual([]);
		expect(store.failed).toEqual([]);
		expect(events).toEqual([
			{ event: "fix_files.skipped", fields: { auditId: ID, reason: "taken" } },
		]);
	});

	it("claims with the pg-boss job id", async () => {
		const store = fakeStore();
		await runFixFilesJob(deps(store), {
			id: "boss-job-7",
			data: { auditId: ID },
			retryCount: 0,
			retryLimit: 1,
		});
		expect(store.claims).toEqual([{ id: ID, jobId: "boss-job-7" }]);
	});

	it("throttles progress to once a second", async () => {
		const store = fakeStore();
		let clock = 10_000;
		const generate = vi.fn(async (_input: unknown, opts: FixOptions) => {
			for (let i = 1; i <= 10; i++) opts.onProgress?.(i, 10);
			clock += 1000;
			opts.onProgress?.(11, 12);
			return RESULT;
		});
		await processFixFiles(
			deps(store, { generate, now: () => clock }),
			{
				auditId: ID,
			},
			JOB_ID,
		);
		expect(store.progressed).toEqual([
			{ id: ID, read: 1, planned: 10 },
			{ id: ID, read: 11, planned: 12 },
		]);
	});

	it("does not fail the job when a progress write fails", async () => {
		const store = fakeStore();
		store.progress = async () => {
			throw new Error("db down");
		};
		const generate = vi.fn(async (_input: unknown, opts: FixOptions) => {
			opts.onProgress?.(1, 2);
			return RESULT;
		});
		await expect(
			processFixFiles(deps(store, { generate }), { auditId: ID }, JOB_ID),
		).resolves.toBe("done");
	});

	it("lets store errors propagate and rejects invalid job data", async () => {
		const store = fakeStore();
		store.complete = async () => {
			throw new Error("db down");
		};
		await expect(
			processFixFiles(deps(store), { auditId: ID }, JOB_ID),
		).rejects.toThrow("db down");
		await expect(
			processFixFiles(deps(fakeStore()), { auditId: "not-a-uuid" }, JOB_ID),
		).rejects.toThrow("Invalid fix files job data");
	});
});

describe("runFixFilesJob", () => {
	const failingStore = () => {
		const store = fakeStore();
		store.claim = async () => {
			throw new Error("db down");
		};
		return store;
	};

	it("rethrows without marking the row failed before the last retry", async () => {
		const store = failingStore();
		await expect(
			runFixFilesJob(deps(store), {
				id: JOB_ID,
				data: { auditId: ID },
				retryCount: 0,
				retryLimit: 1,
			}),
		).rejects.toThrow("db down");
		expect(store.failed).toEqual([]);
	});

	it("marks the row failed on the last retry and rethrows", async () => {
		const store = failingStore();
		const events: string[] = [];
		const log: Logger = (_level, event) => events.push(event);
		await expect(
			runFixFilesJob(deps(store, { log }), {
				id: JOB_ID,
				data: { auditId: ID },
				retryCount: 1,
				retryLimit: 1,
			}),
		).rejects.toThrow("db down");
		expect(store.failed).toEqual([{ id: ID, error: INTERNAL_ERROR }]);
		expect(events).toContain("fix_files.error");
	});
});

describe("runFixFilesDeadLetter", () => {
	it("fails the fix row with the internal error and logs it", async () => {
		const store = fakeStore();
		const events: Array<{ event: string; fields?: Record<string, unknown> }> =
			[];
		const log: Logger = (_level, event, fields) =>
			events.push({ event, fields });
		await expect(
			runFixFilesDeadLetter({ store, log }, { auditId: ID }),
		).resolves.toBe(true);
		expect(store.failed).toEqual([{ id: ID, error: "Internal error" }]);
		expect(events).toEqual([
			{ event: "fix_files.dead_letter", fields: { auditId: ID, failed: true } },
		]);
	});
});
