import {
	auditFixFiles,
	audits,
	claimAudit,
	claimFixFiles,
	createAudit,
	createFixFiles,
	getAudit,
	getFixFiles,
	type NewAuditInput,
	type QueueHandle,
} from "@agentcheck/db";
import {
	createTestDb,
	startTestQueue,
	type TestDbHandle,
} from "@agentcheck/db/testing";
import { afterEach, describe, expect, it } from "vitest";
import type { Logger } from "../src/log.ts";
import { runMaintenance } from "../src/maintenance.ts";

const T0 = new Date("2026-10-19T12:00:00.000Z");
const now = () => T0;
const minutesAgo = (m: number) => new Date(T0.getTime() - m * 60_000);
const daysAgo = (d: number) => new Date(T0.getTime() - d * 86_400_000);

const input: NewAuditInput = {
	url: "https://example.com/",
	host: "example.com",
	mode: "quick",
	userId: null,
};

const noopEnqueue = async () => {};

describe("runMaintenance", () => {
	let handle: TestDbHandle | undefined;
	let queue: QueueHandle | undefined;
	afterEach(async () => {
		await queue?.stop();
		queue = undefined;
		await handle?.close();
		handle = undefined;
	});

	// pg-boss runs too: the sweep reads its job table.
	const setup = async () => {
		handle = await createTestDb();
		queue = await startTestQueue(handle);
		return handle.db;
	};

	it("sweeps stale running audits", async () => {
		const db = await setup();
		const stale = await createAudit(db, input, noopEnqueue);
		await claimAudit(db, stale.id, {
			jobId: "job-1",
			now: () => minutesAgo(6),
		});
		const fresh = await createAudit(db, input, noopEnqueue);
		await claimAudit(db, fresh.id, {
			jobId: "job-1",
			now: () => minutesAgo(4),
		});
		const events: Array<{ event: string; fields?: Record<string, unknown> }> =
			[];
		const log: Logger = (_level, event, fields) => {
			events.push({ event, fields });
		};

		await expect(
			runMaintenance({ db, now, log }, { task: "sweep" }),
		).resolves.toEqual({ task: "sweep", affected: 1 });
		expect(await getAudit(db, stale.id)).toMatchObject({
			status: "failed",
			error: "Audit timed out",
			finishedAt: T0,
		});
		expect((await getAudit(db, fresh.id))?.status).toBe("running");
		expect(events).toEqual([
			{ event: "maintenance.sweep", fields: { affected: 1 } },
		]);
	});

	it("sums stale audits and stale fix-files rows in the sweep", async () => {
		const db = await setup();
		const staleAudit = await createAudit(db, input, noopEnqueue);
		await claimAudit(db, staleAudit.id, {
			jobId: "job-1",
			now: () => minutesAgo(6),
		});
		const owned = await createAudit(
			db,
			{ ...input, host: "owned.com", url: "https://owned.com/" },
			noopEnqueue,
		);
		await createFixFiles(db, owned.id, ["llms"], noopEnqueue);
		await claimFixFiles(db, owned.id, {
			jobId: "job-1",
			now: () => minutesAgo(6),
		});

		await expect(
			runMaintenance({ db, now }, { task: "sweep" }),
		).resolves.toEqual({ task: "sweep", affected: 2 });
		expect(await getFixFiles(db, owned.id)).toMatchObject({
			status: "failed",
			error: "Fix files timed out",
		});
	});

	it("sums orphaned queued audits and fix-files rows in the sweep", async () => {
		const db = await setup();
		await db.insert(audits).values({ ...input, queuedAt: minutesAgo(16) });
		const [owned] = await db
			.insert(audits)
			.values({ ...input, status: "done" })
			.returning();
		if (!owned) throw new Error("no audit");
		await db.insert(auditFixFiles).values({
			auditId: owned.id,
			kinds: ["llms"],
			queuedAt: minutesAgo(16),
		});
		const [waiting] = await db
			.insert(audits)
			.values({ ...input, queuedAt: minutesAgo(14) })
			.returning();
		if (!waiting) throw new Error("no audit");

		await expect(
			runMaintenance({ db, now }, { task: "sweep" }),
		).resolves.toEqual({ task: "sweep", affected: 2 });
		expect(await getFixFiles(db, owned.id)).toMatchObject({
			status: "failed",
			error: "Fix files could not be scheduled",
		});
		expect((await getAudit(db, waiting.id))?.status).toBe("queued");
	});

	it("deletes expired anonymous audits", async () => {
		const db = await setup();
		await db.insert(audits).values([
			{ ...input, createdAt: daysAgo(31) },
			{ ...input, createdAt: daysAgo(29) },
		]);
		const events: string[] = [];
		await expect(
			runMaintenance(
				{ db, now, log: (_level, event) => events.push(event) },
				{ task: "retention" },
			),
		).resolves.toEqual({ task: "retention", affected: 1 });
		expect(await db.select().from(audits)).toHaveLength(1);
		expect(events).toEqual(["maintenance.retention"]);
	});

	it("rejects invalid job data", async () => {
		const db = await setup();
		await expect(runMaintenance({ db, now }, { task: "x" })).rejects.toThrow(
			"Invalid maintenance job data",
		);
	});
});
