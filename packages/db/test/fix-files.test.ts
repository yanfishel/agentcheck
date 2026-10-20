import type { FixFiles } from "@agentcheck/core/fixes";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { QueueHandle } from "../src/index.ts";
import {
	AUDIT_QUEUE,
	auditFixFiles,
	audits,
	claimFixFiles,
	completeFixFiles,
	createAudit,
	createFixFiles,
	FIX_FILES_MAX_ATTEMPTS,
	FIX_FILES_QUEUE,
	FixFilesConflict,
	failFixFiles,
	failStaleFixFiles,
	getFixFiles,
	setFixFilesProgress,
	users,
} from "../src/index.ts";
import {
	createTestDb,
	startTestQueue,
	type TestDbHandle,
} from "../src/testing.ts";

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const noop = async () => {};

const files = { files: [], todos: [] } as unknown as FixFiles;

describe("fix files store", () => {
	let handle: TestDbHandle | undefined;
	let queue: QueueHandle | undefined;
	afterEach(async () => {
		await queue?.stop();
		queue = undefined;
		await handle?.close();
		handle = undefined;
	});

	/** With `queue`, pg-boss is started too (the sweep reads its job table). */
	const setup = async (opts: { queue?: boolean } = {}) => {
		handle = await createTestDb();
		if (opts.queue) queue = await startTestQueue(handle);
		await handle.db
			.insert(users)
			.values({ id: "u1", email: "u@example.com", role: "user" });
		return handle.db;
	};
	const makeAudit = async (
		db: TestDbHandle["db"],
		host = "example.com",
		finalUrl?: string,
	) => {
		const audit = await createAudit(
			db,
			{ url: `https://${host}/`, host, mode: "quick", userId: "u1" },
			noop,
		);
		await db
			.update(audits)
			.set({ status: "done", finalUrl: finalUrl ?? null })
			.where(eq(audits.id, audit.id));
		return audit;
	};

	it("creates a queued row and enqueues in the same transaction", async () => {
		const db = await setup();
		const audit = await makeAudit(db);
		let called = 0;
		const row = await createFixFiles(
			db,
			audit.id,
			["llms", "robots"],
			async () => {
				called++;
			},
		);
		expect(called).toBe(1);
		expect(row.status).toBe("queued");
		expect(row.attempts).toBe(1);
		expect(row.kinds).toEqual(["llms", "robots"]);
		expect((await getFixFiles(db, audit.id))?.auditId).toBe(audit.id);
	});

	it("rolls back when enqueue throws", async () => {
		const db = await setup();
		const audit = await makeAudit(db);
		await expect(
			createFixFiles(db, audit.id, ["llms"], async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(await getFixFiles(db, audit.id)).toBeNull();
	});

	it("returns null or missing for unknown or malformed ids", async () => {
		const db = await setup();
		expect(await getFixFiles(db, UNKNOWN_ID)).toBeNull();
		expect(await getFixFiles(db, "nope")).toBeNull();
		expect(await claimFixFiles(db, "nope", { jobId: "job-1" })).toEqual({
			kind: "missing",
		});
		expect(await claimFixFiles(db, UNKNOWN_ID, { jobId: "job-1" })).toEqual({
			kind: "missing",
		});
	});

	it("conflicts while queued or running and once done", async () => {
		const db = await setup();
		const audit = await makeAudit(db);
		await createFixFiles(db, audit.id, ["llms"], noop);
		await expect(
			createFixFiles(db, audit.id, ["llms"], noop),
		).rejects.toMatchObject({ name: "FixFilesConflict", reason: "running" });
		await claimFixFiles(db, audit.id, { jobId: "job-1" });
		await expect(
			createFixFiles(db, audit.id, ["llms"], noop),
		).rejects.toBeInstanceOf(FixFilesConflict);
		await completeFixFiles(db, audit.id, files);
		await expect(
			createFixFiles(db, audit.id, ["llms"], noop),
		).rejects.toMatchObject({ reason: "done" });
	});

	it("restarts a failed row and counts attempts", async () => {
		const db = await setup();
		const audit = await makeAudit(db);
		await createFixFiles(db, audit.id, ["llms"], noop);
		await claimFixFiles(db, audit.id, { jobId: "job-1" });
		await setFixFilesProgress(db, audit.id, 2, 5);
		await failFixFiles(db, audit.id, "bad");
		const row = await createFixFiles(db, audit.id, ["robots"], noop);
		expect(row.status).toBe("queued");
		expect(row.attempts).toBe(2);
		expect(row.kinds).toEqual(["robots"]);
		expect(row.error).toBeNull();
		expect(row.result).toBeNull();
		expect(row.progressRead).toBeNull();
		expect(row.progressPlanned).toBeNull();
		expect(row.startedAt).toBeNull();
		expect(row.finishedAt).toBeNull();
	});

	it("refuses a fourth attempt", async () => {
		const db = await setup();
		const audit = await makeAudit(db);
		await createFixFiles(db, audit.id, ["llms"], noop);
		for (let i = 1; i < FIX_FILES_MAX_ATTEMPTS; i++) {
			await failFixFiles(db, audit.id, "bad");
			await createFixFiles(db, audit.id, ["llms"], noop);
		}
		expect((await getFixFiles(db, audit.id))?.attempts).toBe(3);
		await failFixFiles(db, audit.id, "bad");
		await expect(
			createFixFiles(db, audit.id, ["llms"], noop),
		).rejects.toMatchObject({ reason: "attempts" });
	});

	it("claims with the final url, falling back to the audit url", async () => {
		const db = await setup();
		const a = await makeAudit(db, "example.com", "https://www.example.com/");
		const b = await makeAudit(db, "other.com");
		await createFixFiles(db, a.id, ["llms"], noop);
		await createFixFiles(db, b.id, ["robots"], noop);
		expect(await claimFixFiles(db, a.id, { jobId: "job-1" })).toEqual({
			kind: "claimed",
			url: "https://www.example.com/",
			kinds: ["llms"],
		});
		expect(await claimFixFiles(db, b.id, { jobId: "job-1" })).toEqual({
			kind: "claimed",
			url: "https://other.com/",
			kinds: ["robots"],
		});
		const row = await getFixFiles(db, a.id);
		expect(row?.status).toBe("running");
		expect(row?.startedAt).toBeInstanceOf(Date);
	});

	it("reports busy when another fix job of the same host runs", async () => {
		const db = await setup();
		const a = await makeAudit(db);
		const b = await makeAudit(db);
		const c = await makeAudit(db, "other.com");
		for (const x of [a, b, c]) await createFixFiles(db, x.id, ["llms"], noop);
		expect((await claimFixFiles(db, a.id, { jobId: "job-1" })).kind).toBe(
			"claimed",
		);
		expect(await claimFixFiles(db, b.id, { jobId: "job-1" })).toEqual({
			kind: "busy",
			host: "example.com",
		});
		expect((await getFixFiles(db, b.id))?.status).toBe("queued");
		expect((await claimFixFiles(db, c.id, { jobId: "job-1" })).kind).toBe(
			"claimed",
		);
		// A running row can be claimed again (retried job).
		expect((await claimFixFiles(db, a.id, { jobId: "job-1" })).kind).toBe(
			"claimed",
		);
		await completeFixFiles(db, a.id, files);
		expect((await claimFixFiles(db, b.id, { jobId: "job-1" })).kind).toBe(
			"claimed",
		);
	});

	it("reports finished rows and never overwrites done or failed", async () => {
		const db = await setup();
		const a = await makeAudit(db);
		const b = await makeAudit(db, "other.com");
		await createFixFiles(db, a.id, ["llms"], noop);
		await createFixFiles(db, b.id, ["llms"], noop);
		// Not running yet.
		expect(await completeFixFiles(db, a.id, files)).toBe(false);
		await claimFixFiles(db, a.id, { jobId: "job-1" });
		await claimFixFiles(db, b.id, { jobId: "job-1" });
		expect(await completeFixFiles(db, a.id, files)).toBe(true);
		expect(await failFixFiles(db, a.id, "late")).toBe(false);
		expect(await completeFixFiles(db, a.id, files)).toBe(false);
		expect(await claimFixFiles(db, a.id, { jobId: "job-1" })).toEqual({
			kind: "finished",
		});
		expect(await failFixFiles(db, b.id, "boom")).toBe(true);
		expect(await completeFixFiles(db, b.id, files)).toBe(false);
		expect(await claimFixFiles(db, b.id, { jobId: "job-1" })).toEqual({
			kind: "finished",
		});
		const row = await getFixFiles(db, a.id);
		expect(row?.status).toBe("done");
		expect(row?.result).toEqual(files);
		expect(row?.error).toBeNull();
		expect((await getFixFiles(db, b.id))?.error).toBe("boom");
	});

	it("stores progress only while running", async () => {
		const db = await setup();
		const a = await makeAudit(db);
		await createFixFiles(db, a.id, ["llms"], noop);
		await setFixFilesProgress(db, a.id, 1, 4);
		expect((await getFixFiles(db, a.id))?.progressRead).toBeNull();
		await claimFixFiles(db, a.id, { jobId: "job-1" });
		await setFixFilesProgress(db, a.id, 1, 4);
		const row = await getFixFiles(db, a.id);
		expect([row?.progressRead, row?.progressPlanned]).toEqual([1, 4]);
	});

	it("cascades with the audit", async () => {
		const db = await setup();
		const a = await makeAudit(db);
		await createFixFiles(db, a.id, ["llms"], noop);
		await db.delete(audits).where(eq(audits.id, a.id));
		expect(await db.select().from(auditFixFiles)).toEqual([]);
	});

	it("lets only the claiming job reclaim a running row", async () => {
		const db = await setup();
		const a = await makeAudit(db);
		await createFixFiles(db, a.id, ["llms"], noop);
		expect((await claimFixFiles(db, a.id, { jobId: "job-a" })).kind).toBe(
			"claimed",
		);
		expect((await getFixFiles(db, a.id))?.claimedBy).toBe("job-a");
		const before = await getFixFiles(db, a.id);
		expect(await claimFixFiles(db, a.id, { jobId: "job-b" })).toEqual({
			kind: "taken",
		});
		expect(await getFixFiles(db, a.id)).toEqual(before);
		expect((await claimFixFiles(db, a.id, { jobId: "job-a" })).kind).toBe(
			"claimed",
		);
	});

	it("lets any job reclaim a running row claimed before claimed_by existed", async () => {
		const db = await setup();
		const a = await makeAudit(db);
		await createFixFiles(db, a.id, ["llms"], noop);
		await db
			.update(auditFixFiles)
			.set({ status: "running", startedAt: new Date(1_000) })
			.where(eq(auditFixFiles.auditId, a.id));
		expect((await claimFixFiles(db, a.id, { jobId: "job-z" })).kind).toBe(
			"claimed",
		);
		expect((await getFixFiles(db, a.id))?.claimedBy).toBe("job-z");
		expect(await claimFixFiles(db, a.id, { jobId: "job-y" })).toEqual({
			kind: "taken",
		});
	});

	it("clears the claiming job and re-stamps the queue time on restart", async () => {
		const db = await setup();
		const a = await makeAudit(db);
		await createFixFiles(db, a.id, ["llms"], noop);
		await db
			.update(auditFixFiles)
			.set({ queuedAt: new Date("2020-01-01T00:00:00Z") })
			.where(eq(auditFixFiles.auditId, a.id));
		await claimFixFiles(db, a.id, { jobId: "job-a" });
		await failFixFiles(db, a.id, "bad");
		const row = await createFixFiles(db, a.id, ["llms"], noop);
		expect(row.claimedBy).toBeNull();
		expect(row.queuedAt.getTime()).toBeGreaterThan(
			new Date("2021-01-01T00:00:00Z").getTime(),
		);
	});

	it("fails rows queued for more than fifteen minutes unless busy claims refresh them", async () => {
		const db = await setup({ queue: true });
		const t0 = new Date("2030-01-01T12:00:00Z");
		const minutesAgo = (m: number) => new Date(t0.getTime() - m * 60_000);
		const orphan = await makeAudit(db, "orphan.com");
		const waiting = await makeAudit(db, "waiting.com");
		const blocker = await makeAudit(db, "waiting.com");
		for (const x of [orphan, waiting, blocker]) {
			await createFixFiles(db, x.id, ["llms"], noop);
			await db
				.update(auditFixFiles)
				.set({ queuedAt: minutesAgo(30) })
				.where(eq(auditFixFiles.auditId, x.id));
		}
		await claimFixFiles(db, blocker.id, {
			jobId: "job-1",
			now: () => minutesAgo(1),
		});
		expect(
			await claimFixFiles(db, waiting.id, {
				jobId: "job-2",
				now: () => minutesAgo(1),
			}),
		).toEqual({ kind: "busy", host: "waiting.com" });

		expect(await failStaleFixFiles(db, () => t0)).toBe(1);
		expect(await getFixFiles(db, orphan.id)).toMatchObject({
			status: "failed",
			error: "Fix files could not be scheduled",
			finishedAt: t0,
		});
		expect((await getFixFiles(db, waiting.id))?.status).toBe("queued");
		expect((await getFixFiles(db, blocker.id))?.status).toBe("running");
	});

	it("keeps an old queued row whose job is still waiting or active", async () => {
		const db = await setup({ queue: true });
		if (!queue) throw new Error("no queue");
		const t0 = new Date("2030-01-01T12:00:00Z");
		const a = await makeAudit(db);
		await createFixFiles(db, a.id, ["llms"], noop);
		await db
			.update(auditFixFiles)
			.set({ queuedAt: new Date(t0.getTime() - 30 * 60_000) })
			.where(eq(auditFixFiles.auditId, a.id));
		await queue.boss.send(FIX_FILES_QUEUE, { auditId: a.id });

		expect(await failStaleFixFiles(db, () => t0)).toBe(0);
		const [job] = await queue.boss.fetch(FIX_FILES_QUEUE);
		expect(job).toBeDefined();
		expect(await failStaleFixFiles(db, () => t0)).toBe(0);
		expect((await getFixFiles(db, a.id))?.status).toBe("queued");
	});

	it("fails an old queued row whose only jobs are finished or on another queue", async () => {
		const db = await setup({ queue: true });
		if (!queue) throw new Error("no queue");
		const t0 = new Date("2030-01-01T12:00:00Z");
		const a = await makeAudit(db);
		await createFixFiles(db, a.id, ["llms"], noop);
		await db
			.update(auditFixFiles)
			.set({ queuedAt: new Date(t0.getTime() - 30 * 60_000) })
			.where(eq(auditFixFiles.auditId, a.id));
		await queue.boss.send(FIX_FILES_QUEUE, { auditId: a.id });
		const [job] = await queue.boss.fetch(FIX_FILES_QUEUE);
		if (!job) throw new Error("no job");
		await queue.boss.complete(FIX_FILES_QUEUE, job.id);
		await queue.boss.send(AUDIT_QUEUE, { auditId: a.id });

		expect(await failStaleFixFiles(db, () => t0)).toBe(1);
		expect((await getFixFiles(db, a.id))?.error).toBe(
			"Fix files could not be scheduled",
		);
	});

	it("fails stale running rows", async () => {
		const db = await setup({ queue: true });
		const a = await makeAudit(db);
		const b = await makeAudit(db, "other.com");
		await createFixFiles(db, a.id, ["llms"], noop);
		await createFixFiles(db, b.id, ["llms"], noop);
		const t0 = new Date("2026-10-20T10:00:00Z");
		await claimFixFiles(db, a.id, { jobId: "job-1", now: () => t0 });
		await claimFixFiles(db, b.id, {
			jobId: "job-1",
			now: () => new Date(t0.getTime() + 4 * 60_000),
		});
		const now = () => new Date(t0.getTime() + 6 * 60_000);
		expect(await failStaleFixFiles(db, now)).toBe(1);
		const row = await getFixFiles(db, a.id);
		expect(row?.status).toBe("failed");
		expect(row?.error).toBe("Fix files timed out");
		expect((await getFixFiles(db, b.id))?.status).toBe("running");
	});
});
