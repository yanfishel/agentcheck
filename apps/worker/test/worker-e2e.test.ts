import type { AuditOptions, AuditResult } from "@agentcheck/core";
import {
	AUDIT_QUEUE,
	claimAudit,
	createAudit,
	type Db,
	enqueueAudit,
	failAudit,
	getAudit,
	type QueueHandle,
} from "@agentcheck/db";
import {
	createTestDb,
	startTestQueue,
	type TestDbHandle,
} from "@agentcheck/db/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dbAuditStore } from "../src/audit-store.ts";
import type { Logger } from "../src/log.ts";
import { runJob } from "../src/process-audit.ts";

const URL_ = "https://example.com/";

const RESULT: AuditResult = {
	tool: { name: "agentcheck", version: "0.1.0" },
	target: URL_,
	finalUrl: URL_,
	timestamp: "2026-10-19T00:00:00.000Z",
	categories: [],
	score: 91,
	grade: "A",
	browser: { used: false, reason: "disabled" },
};

type FakeAudit = (target: string, opts: AuditOptions) => Promise<AuditResult>;

describe("worker on pg-boss", () => {
	let handle: TestDbHandle | undefined;
	let queue: QueueHandle | undefined;

	afterEach(async () => {
		await queue?.stop();
		queue = undefined;
		await handle?.close();
		handle = undefined;
	});

	const runWorker = async (
		audit: FakeAudit,
		opts: {
			hostRunningMax?: () => Promise<number>;
			seed?: (db: Db) => Promise<void>;
			log?: Logger;
		} = {},
	) => {
		handle = await createTestDb();
		queue = await startTestQueue(handle);
		const { boss } = queue;
		const { db } = handle;
		await opts.seed?.(db);
		const store = dbAuditStore(db, boss, {
			hostRunningMax: opts.hostRunningMax,
		});
		const log: Logger = opts.log ?? (() => {});
		const row = await createAudit(
			db,
			{ url: URL_, host: "example.com", mode: "quick", userId: null },
			(tx, a) => enqueueAudit(boss, tx, a),
		);
		await boss.work(
			AUDIT_QUEUE,
			{ includeMetadata: true, pollingIntervalSeconds: 0.5 },
			async ([job]) => {
				if (job) await runJob({ store, audit, log }, job);
			},
		);
		return { db, id: row.id };
	};

	it("runs a queued audit and stores the result", async () => {
		const { db, id } = await runWorker(async () => RESULT);
		await vi.waitFor(
			async () => expect((await getAudit(db, id))?.status).toBe("done"),
			{ timeout: 10_000, interval: 100 },
		);
		expect(await getAudit(db, id)).toMatchObject({
			status: "done",
			score: 91,
			grade: "A",
			finalUrl: URL_,
			result: RESULT,
			error: null,
		});
	});

	it("records a failed audit with the error text", async () => {
		const { db, id } = await runWorker(async () => {
			throw new Error("Could not reach https://example.com/");
		});
		await vi.waitFor(
			async () => expect((await getAudit(db, id))?.status).toBe("failed"),
			{ timeout: 10_000, interval: 100 },
		);
		expect(await getAudit(db, id)).toMatchObject({
			status: "failed",
			error: "Could not reach https://example.com/",
			result: null,
		});
	});

	it("requeues an audit while its host is busy and runs it once the host frees up", async () => {
		let blockerId = "";
		const events: string[] = [];
		const { db, id } = await runWorker(async () => RESULT, {
			hostRunningMax: async () => 1,
			seed: async (db) => {
				const blocker = await createAudit(
					db,
					{ url: URL_, host: "example.com", mode: "quick", userId: null },
					async () => {},
				);
				await claimAudit(db, blocker.id, { jobId: "job-1" });
				blockerId = blocker.id;
			},
			log: (_level, event) => {
				events.push(event);
			},
		});
		await vi.waitFor(() => expect(events).toContain("audit.requeued"), {
			timeout: 10_000,
			interval: 100,
		});
		expect((await getAudit(db, id))?.status).toBe("queued");
		await failAudit(db, blockerId, "test");
		await vi.waitFor(
			async () => expect((await getAudit(db, id))?.status).toBe("done"),
			{ timeout: 15_000, interval: 100 },
		);
	}, 30_000);
});
