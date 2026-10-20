import type { AuditResult, Favicon, Screenshot } from "@agentcheck/core";
import { count, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
	AUDIT_QUEUE,
	type Audit,
	auditFavicons,
	auditScreenshots,
	audits,
	claimAudit,
	completeAudit,
	countAudits,
	countUserSites,
	createAudit,
	type Db,
	deleteExpiredAnonymousAudits,
	FIX_FILES_QUEUE,
	failAudit,
	failStaleAudits,
	getAudit,
	getAuditByShareToken,
	getAuditFavicon,
	getAuditScreenshot,
	listAudits,
	listUserHistory,
	type NewAuditInput,
	type QueueHandle,
	setShareToken,
	users,
} from "../src/index.ts";
import { createTestDb, startTestQueue } from "../src/testing.ts";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

const input: NewAuditInput = {
	url: "https://example.com/",
	host: "example.com",
	mode: "quick",
	userId: null,
};

const result: AuditResult = {
	tool: { name: "agentcheck", version: "0.1.0" },
	target: "https://example.com/",
	finalUrl: "https://www.example.com/",
	timestamp: "2026-10-19T00:00:00.000Z",
	categories: [],
	score: 87,
	grade: "B",
	browser: { used: false, reason: "disabled" },
};

const completion = {
	result,
	finalUrl: "https://www.example.com/",
	score: 87,
	grade: "B",
};

const screenshot: Screenshot = {
	contentType: "image/webp",
	large: new Uint8Array([1, 2, 3, 4]),
	small: new Uint8Array([9, 8]),
};

const favicon: Favicon = {
	contentType: "image/png",
	body: new Uint8Array([7, 7, 7]),
};

const noopEnqueue = async () => {};

describe("audits", () => {
	let close: (() => Promise<void>) | undefined;
	let queue: QueueHandle | undefined;
	afterEach(async () => {
		await queue?.stop();
		queue = undefined;
		await close?.();
		close = undefined;
	});
	/** With `queue`, pg-boss is started too (the sweep reads its job table). */
	const setup = async (opts: { queue?: boolean } = {}): Promise<Db> => {
		const t = await createTestDb();
		close = t.close;
		if (opts.queue) queue = await startTestQueue(t);
		return t.db;
	};
	const boss = () => {
		if (!queue) throw new Error("setup({ queue: true }) first");
		return queue.boss;
	};
	const rowCount = async (db: Db) => {
		const [row] = await db.select({ n: count() }).from(audits);
		return row?.n;
	};

	describe("createAudit", () => {
		it("stores a queued audit and passes it to enqueue", async () => {
			const db = await setup();
			const seen: Audit[] = [];
			const audit = await createAudit(db, input, async (_tx, a) => {
				seen.push(a);
			});
			expect(audit.status).toBe("queued");
			expect(audit.id).toMatch(UUID_RE);
			expect(audit.createdAt).toBeInstanceOf(Date);
			expect(audit.userId).toBeNull();
			expect(audit).toMatchObject({
				url: input.url,
				host: input.host,
				mode: "quick",
				ipHash: null,
				result: null,
				startedAt: null,
				finishedAt: null,
			});
			expect(seen.map((a) => a.id)).toEqual([audit.id]);
			expect(await getAudit(db, audit.id)).toEqual(audit);
		});

		it("stores nothing when enqueue throws", async () => {
			const db = await setup();
			await expect(
				createAudit(db, input, async () => {
					throw new Error("queue down");
				}),
			).rejects.toThrow("queue down");
			expect(await rowCount(db)).toBe(0);
		});

		it("stores nothing and skips enqueue when before throws", async () => {
			const db = await setup();
			let enqueued = false;
			await expect(
				createAudit(
					db,
					input,
					async () => {
						enqueued = true;
					},
					async () => {
						throw new Error("limited");
					},
				),
			).rejects.toThrow("limited");
			expect(enqueued).toBe(false);
			expect(await rowCount(db)).toBe(0);
		});

		it("inserts when before resolves", async () => {
			const db = await setup();
			let ran = false;
			await createAudit(db, input, noopEnqueue, async () => {
				ran = true;
			});
			expect(ran).toBe(true);
			expect(await rowCount(db)).toBe(1);
		});
	});

	describe("getAudit", () => {
		it("returns null for a malformed id", async () => {
			const db = await setup();
			expect(await getAudit(db, "not-a-uuid")).toBeNull();
		});

		it("returns null for an unknown id", async () => {
			const db = await setup();
			expect(await getAudit(db, UNKNOWN_ID)).toBeNull();
		});
	});

	describe("claimAudit", () => {
		it("claims a queued audit, re-claims a running one, then reports it finished", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);

			const first = await claimAudit(db, audit.id, {
				jobId: "job-1",
				now: () => new Date(1_000),
			});
			expect(first.kind).toBe("claimed");
			if (first.kind !== "claimed") throw new Error("unreachable");
			expect(first.audit.status).toBe("running");
			expect(first.audit.startedAt).toEqual(new Date(1_000));

			const retry = await claimAudit(db, audit.id, {
				jobId: "job-1",
				now: () => new Date(2_000),
			});
			expect(retry.kind).toBe("claimed");
			if (retry.kind !== "claimed") throw new Error("unreachable");
			expect(retry.audit.status).toBe("running");
			expect(retry.audit.startedAt?.getTime()).toBeGreaterThan(
				first.audit.startedAt?.getTime() ?? Number.POSITIVE_INFINITY,
			);

			expect(await completeAudit(db, audit.id, completion)).toBe(true);
			expect(await claimAudit(db, audit.id, { jobId: "job-1" })).toEqual({
				kind: "finished",
				status: "done",
			});
		});

		it("reports a failed audit as finished", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			expect(await failAudit(db, audit.id, "boom")).toBe(true);
			expect(await claimAudit(db, audit.id, { jobId: "job-1" })).toEqual({
				kind: "finished",
				status: "failed",
			});
		});

		it("reports unknown and malformed ids as missing", async () => {
			const db = await setup();
			expect(await claimAudit(db, UNKNOWN_ID, { jobId: "job-1" })).toEqual({
				kind: "missing",
			});
			expect(await claimAudit(db, "not-a-uuid", { jobId: "job-1" })).toEqual({
				kind: "missing",
			});
			expect(
				await claimAudit(db, UNKNOWN_ID, { jobId: "job-1", hostRunningMax: 1 }),
			).toEqual({
				kind: "missing",
			});
		});

		it("reports busy when the host already runs hostRunningMax audits", async () => {
			const db = await setup();
			const running = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, running.id, { jobId: "job-1" });
			const queued = await createAudit(
				db,
				{ ...input, mode: "full" },
				noopEnqueue,
			);
			const busyAt = new Date("2030-01-01T00:00:00.000Z");
			expect(
				await claimAudit(db, queued.id, {
					jobId: "job-2",
					hostRunningMax: 1,
					now: () => busyAt,
				}),
			).toEqual({
				kind: "busy",
				host: "example.com",
				mode: "full",
			});
			// Still queued and unclaimed; only the queue stamp is refreshed so
			// the sweep does not take a waiting audit for an orphan.
			expect(await getAudit(db, queued.id)).toEqual({
				...queued,
				queuedAt: busyAt,
			});
		});

		it("records the claiming job and lets only that job reclaim a running audit", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			const first = await claimAudit(db, audit.id, { jobId: "job-a" });
			expect(first.kind).toBe("claimed");
			if (first.kind !== "claimed") throw new Error("unreachable");
			expect(first.audit.claimedBy).toBe("job-a");

			const before = await getAudit(db, audit.id);
			expect(await claimAudit(db, audit.id, { jobId: "job-b" })).toEqual({
				kind: "taken",
			});
			expect(await getAudit(db, audit.id)).toEqual(before);

			const retry = await claimAudit(db, audit.id, {
				jobId: "job-a",
				now: () => new Date(5_000),
			});
			expect(retry.kind).toBe("claimed");
			if (retry.kind !== "claimed") throw new Error("unreachable");
			expect(retry.audit.claimedBy).toBe("job-a");
			expect(retry.audit.startedAt).toEqual(new Date(5_000));
		});

		it("lets any job reclaim a running audit claimed before claimed_by existed", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await db
				.update(audits)
				.set({ status: "running", startedAt: new Date(1_000) })
				.where(eq(audits.id, audit.id));
			const claim = await claimAudit(db, audit.id, { jobId: "job-z" });
			expect(claim.kind).toBe("claimed");
			if (claim.kind !== "claimed") throw new Error("unreachable");
			expect(claim.audit.claimedBy).toBe("job-z");
			expect(await claimAudit(db, audit.id, { jobId: "job-y" })).toEqual({
				kind: "taken",
			});
		});

		it("claims when the running audit is on another host", async () => {
			const db = await setup();
			const other = await createAudit(
				db,
				{ ...input, url: "https://other.test/", host: "other.test" },
				noopEnqueue,
			);
			await claimAudit(db, other.id, { jobId: "job-1" });
			const queued = await createAudit(db, input, noopEnqueue);
			const claim = await claimAudit(db, queued.id, {
				jobId: "job-1",
				hostRunningMax: 1,
			});
			expect(claim.kind).toBe("claimed");
		});

		it("reclaims a running audit even when its host is full", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			const retry = await claimAudit(db, audit.id, {
				jobId: "job-1",
				hostRunningMax: 1,
				now: () => new Date(9_000),
			});
			expect(retry.kind).toBe("claimed");
			if (retry.kind !== "claimed") throw new Error("unreachable");
			expect(retry.audit.startedAt).toEqual(new Date(9_000));
		});
	});

	describe("failStaleAudits", () => {
		const T0 = new Date("2026-10-19T12:00:00.000Z");
		const minutesAgo = (m: number) => new Date(T0.getTime() - m * 60_000);

		it("fails audits running longer than five minutes", async () => {
			const db = await setup({ queue: true });
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
			const done = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, done.id, {
				jobId: "job-1",
				now: () => minutesAgo(10),
			});
			await completeAudit(db, done.id, completion);
			const failed = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, failed.id, {
				jobId: "job-1",
				now: () => minutesAgo(10),
			});
			await failAudit(db, failed.id, "boom");
			const queued = await createAudit(db, input, noopEnqueue);

			const before = {
				fresh: await getAudit(db, fresh.id),
				done: await getAudit(db, done.id),
				failed: await getAudit(db, failed.id),
				queued: await getAudit(db, queued.id),
			};

			expect(await failStaleAudits(db, () => T0)).toBe(1);
			expect(await getAudit(db, stale.id)).toMatchObject({
				status: "failed",
				error: "Audit timed out",
				finishedAt: T0,
			});
			expect({
				fresh: await getAudit(db, fresh.id),
				done: await getAudit(db, done.id),
				failed: await getAudit(db, failed.id),
				queued: await getAudit(db, queued.id),
			}).toEqual(before);
		});
	});

	describe("failStaleAudits (queued)", () => {
		const T0 = new Date("2030-01-01T12:00:00.000Z");
		const minutesAgo = (m: number) => new Date(T0.getTime() - m * 60_000);
		const setQueuedAt = async (db: Db, id: string, at: Date) => {
			await db.update(audits).set({ queuedAt: at }).where(eq(audits.id, id));
		};

		it("fails audits queued for more than fifteen minutes", async () => {
			const db = await setup({ queue: true });
			const orphan = await createAudit(db, input, noopEnqueue);
			await setQueuedAt(db, orphan.id, minutesAgo(16));
			const waiting = await createAudit(db, input, noopEnqueue);
			await setQueuedAt(db, waiting.id, minutesAgo(14));
			const before = await getAudit(db, waiting.id);

			expect(await failStaleAudits(db, () => T0)).toBe(1);
			expect(await getAudit(db, orphan.id)).toMatchObject({
				status: "failed",
				error: "Audit could not be scheduled",
				finishedAt: T0,
			});
			expect(await getAudit(db, waiting.id)).toEqual(before);
		});

		it("keeps an old audit queued while busy claims refresh it", async () => {
			const db = await setup({ queue: true });
			const blocker = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, blocker.id, {
				jobId: "job-1",
				now: () => minutesAgo(1),
			});
			const waiting = await createAudit(db, input, noopEnqueue);
			await setQueuedAt(db, waiting.id, minutesAgo(30));
			const claim = await claimAudit(db, waiting.id, {
				jobId: "job-2",
				hostRunningMax: 1,
				now: () => minutesAgo(1),
			});
			expect(claim.kind).toBe("busy");

			expect(await failStaleAudits(db, () => T0)).toBe(0);
			expect((await getAudit(db, waiting.id))?.status).toBe("queued");
		});

		it("keeps an old queued audit whose job is still waiting or active", async () => {
			const db = await setup({ queue: true });
			const waiting = await createAudit(db, input, noopEnqueue);
			await setQueuedAt(db, waiting.id, minutesAgo(30));
			await boss().send(AUDIT_QUEUE, { auditId: waiting.id });

			expect(await failStaleAudits(db, () => T0)).toBe(0);
			const [job] = await boss().fetch(AUDIT_QUEUE);
			expect(job).toBeDefined();
			expect(await failStaleAudits(db, () => T0)).toBe(0);
			expect((await getAudit(db, waiting.id))?.status).toBe("queued");
		});

		it("fails an old queued audit whose only jobs are finished or on another queue", async () => {
			const db = await setup({ queue: true });
			const orphan = await createAudit(db, input, noopEnqueue);
			await setQueuedAt(db, orphan.id, minutesAgo(30));
			await boss().send(AUDIT_QUEUE, { auditId: orphan.id });
			const [job] = await boss().fetch(AUDIT_QUEUE);
			if (!job) throw new Error("no job");
			await boss().complete(AUDIT_QUEUE, job.id);
			await boss().send(FIX_FILES_QUEUE, { auditId: orphan.id });

			expect(await failStaleAudits(db, () => T0)).toBe(1);
			expect(await getAudit(db, orphan.id)).toMatchObject({
				status: "failed",
				error: "Audit could not be scheduled",
			});
		});
	});

	describe("deleteExpiredAnonymousAudits", () => {
		const T0 = new Date("2026-10-19T12:00:00.000Z");
		const daysAgo = (d: number) => new Date(T0.getTime() - d * 86_400_000);

		it("deletes anonymous audits older than 30 days", async () => {
			const db = await setup();
			await db
				.insert(users)
				.values({ id: "u1", email: "a@x.com", role: "user" });
			const [old, recent, owned] = await db
				.insert(audits)
				.values([
					{ ...input, createdAt: daysAgo(31) },
					{ ...input, createdAt: daysAgo(29) },
					{ ...input, userId: "u1", createdAt: daysAgo(31) },
				])
				.returning();
			if (!old || !recent || !owned) throw new Error("insert failed");

			await db.insert(auditScreenshots).values({
				auditId: old.id,
				contentType: "image/webp",
				large: screenshot.large,
				small: screenshot.small,
			});

			await db.insert(auditFavicons).values({
				auditId: old.id,
				contentType: favicon.contentType,
				body: favicon.body,
			});

			expect(await deleteExpiredAnonymousAudits(db, () => T0)).toBe(1);
			expect(await getAuditScreenshot(db, old.id, "small")).toBeNull();
			expect(await getAuditFavicon(db, old.id)).toBeNull();
			expect(await getAudit(db, old.id)).toBeNull();
			expect(await getAudit(db, recent.id)).not.toBeNull();
			expect(await getAudit(db, owned.id)).not.toBeNull();
		});
	});

	describe("completeAudit", () => {
		it("stores the result of a running audit", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			const finished = new Date(5_000);
			expect(
				await completeAudit(db, audit.id, completion, () => finished),
			).toBe(true);
			expect(await getAudit(db, audit.id)).toMatchObject({
				status: "done",
				result,
				finalUrl: completion.finalUrl,
				score: 87,
				grade: "B",
				error: null,
				finishedAt: finished,
			});
		});

		it("completeAudit stores the screenshot and flags the audit", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			expect(
				await completeAudit(db, audit.id, { ...completion, screenshot }),
			).toBe(true);
			expect((await getAudit(db, audit.id))?.hasScreenshot).toBe(true);
			const small = await getAuditScreenshot(db, audit.id, "small");
			expect(small?.contentType).toBe("image/webp");
			expect(Array.from(small?.body ?? [])).toEqual([9, 8]);
			const large = await getAuditScreenshot(db, audit.id, "large");
			expect(Array.from(large?.body ?? [])).toEqual([1, 2, 3, 4]);
		});

		it("completeAudit without a screenshot leaves the flag false", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			expect(await completeAudit(db, audit.id, completion)).toBe(true);
			expect((await getAudit(db, audit.id))?.hasScreenshot).toBe(false);
			expect(await getAuditScreenshot(db, audit.id, "small")).toBeNull();
		});

		it("a completion that loses the race stores no screenshot", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			await failAudit(db, audit.id, "Audit timed out");
			expect(
				await completeAudit(db, audit.id, { ...completion, screenshot }),
			).toBe(false);
			expect((await getAudit(db, audit.id))?.hasScreenshot).toBe(false);
			expect(await getAuditScreenshot(db, audit.id, "large")).toBeNull();
		});

		it("getAuditScreenshot returns null for a non-uuid id", async () => {
			const db = await setup();
			expect(await getAuditScreenshot(db, "not-a-uuid", "small")).toBeNull();
		});

		it("completeAudit stores the favicon and flags the audit", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			expect(
				await completeAudit(db, audit.id, { ...completion, favicon }),
			).toBe(true);
			expect((await getAudit(db, audit.id))?.hasFavicon).toBe(true);
			const stored = await getAuditFavicon(db, audit.id);
			expect(stored?.contentType).toBe("image/png");
			expect(Array.from(stored?.body ?? [])).toEqual([7, 7, 7]);
		});

		it("completeAudit without a favicon leaves the flag false", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			expect(await completeAudit(db, audit.id, completion)).toBe(true);
			expect((await getAudit(db, audit.id))?.hasFavicon).toBe(false);
			expect(await getAuditFavicon(db, audit.id)).toBeNull();
		});

		it("a completion with a screenshot and a favicon stores both", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			await completeAudit(db, audit.id, { ...completion, screenshot, favicon });
			expect(
				(await getAuditScreenshot(db, audit.id, "small"))?.body,
			).toBeTruthy();
			expect((await getAuditFavicon(db, audit.id))?.body).toBeTruthy();
		});

		it("a completion that loses the race stores no favicon", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			await failAudit(db, audit.id, "Audit timed out");
			expect(
				await completeAudit(db, audit.id, { ...completion, favicon }),
			).toBe(false);
			expect((await getAudit(db, audit.id))?.hasFavicon).toBe(false);
			expect(await getAuditFavicon(db, audit.id)).toBeNull();
		});

		it("getAuditFavicon returns null for a non-uuid id", async () => {
			const db = await setup();
			expect(await getAuditFavicon(db, "not-a-uuid")).toBeNull();
		});

		it("does not touch a queued audit", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			expect(await completeAudit(db, audit.id, completion)).toBe(false);
			expect(await getAudit(db, audit.id)).toEqual(audit);
		});

		it("returns false for unknown and malformed ids", async () => {
			const db = await setup();
			expect(await completeAudit(db, UNKNOWN_ID, completion)).toBe(false);
			expect(await completeAudit(db, "not-a-uuid", completion)).toBe(false);
		});
	});

	describe("failAudit", () => {
		it("marks a running audit failed", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			const finished = new Date(6_000);
			expect(await failAudit(db, audit.id, "timeout", () => finished)).toBe(
				true,
			);
			expect(await getAudit(db, audit.id)).toMatchObject({
				status: "failed",
				error: "timeout",
				finishedAt: finished,
				result: null,
			});
		});

		it("cannot overwrite a completed audit", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			await completeAudit(db, audit.id, completion);
			expect(await failAudit(db, audit.id, "late")).toBe(false);
			expect(await getAudit(db, audit.id)).toMatchObject({
				status: "done",
				error: null,
				result,
			});
		});

		it("cannot be overwritten by a late result", async () => {
			const db = await setup();
			const audit = await createAudit(db, input, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			await failAudit(db, audit.id, "timeout");
			expect(await completeAudit(db, audit.id, completion)).toBe(false);
			expect(await getAudit(db, audit.id)).toMatchObject({
				status: "failed",
				error: "timeout",
				result: null,
				score: null,
			});
		});

		it("returns false for unknown and malformed ids", async () => {
			const db = await setup();
			expect(await failAudit(db, UNKNOWN_ID, "x")).toBe(false);
			expect(await failAudit(db, "not-a-uuid", "x")).toBe(false);
		});
	});

	describe("constraints", () => {
		it("rejects an unknown mode", async () => {
			const db = await setup();
			await expect(
				db.insert(audits).values({
					url: input.url,
					host: input.host,
					mode: "deep" as "quick",
				}),
			).rejects.toThrow();
			expect(await rowCount(db)).toBe(0);
		});

		it("rejects an unknown status", async () => {
			const db = await setup();
			await expect(
				db.insert(audits).values({
					url: input.url,
					host: input.host,
					mode: "quick",
					status: "odd" as "queued",
				}),
			).rejects.toThrow();
			expect(await rowCount(db)).toBe(0);
		});

		it("nulls user_id when the user is deleted", async () => {
			const db = await setup();
			await db
				.insert(users)
				.values({ id: "u1", email: "a@x.com", role: "user" });
			const audit = await createAudit(
				db,
				{ ...input, userId: "u1", ipHash: "h" },
				noopEnqueue,
			);
			expect(audit).toMatchObject({ userId: "u1", ipHash: "h" });
			await db.delete(users).where(eq(users.id, "u1"));
			expect((await getAudit(db, audit.id))?.userId).toBeNull();
		});
	});

	describe("share tokens", () => {
		const TOKEN = "abcdefghijklmnopqrstuvwx";
		const doneAudit = async (db: Db, userId: string | null) => {
			const audit = await createAudit(db, { ...input, userId }, noopEnqueue);
			await claimAudit(db, audit.id, { jobId: "job-1" });
			await completeAudit(db, audit.id, completion);
			return audit;
		};
		const seedUsers = async (db: Db) => {
			await db.insert(users).values([
				{ id: "u1", email: "a@x.com", role: "user" },
				{ id: "u2", email: "b@x.com", role: "user" },
			]);
		};

		it("sets and clears the token for the owner of a done audit", async () => {
			const db = await setup();
			await seedUsers(db);
			const audit = await doneAudit(db, "u1");
			expect((await setShareToken(db, audit.id, "u1", TOKEN))?.shareToken).toBe(
				TOKEN,
			);
			expect((await getAuditByShareToken(db, TOKEN))?.id).toBe(audit.id);
			expect((await setShareToken(db, audit.id, "u1", null))?.shareToken).toBe(
				null,
			);
			expect(await getAuditByShareToken(db, TOKEN)).toBeNull();
		});

		it("keeps the first token when a second create races in", async () => {
			const db = await setup();
			await seedUsers(db);
			const audit = await doneAudit(db, "u1");
			const other = "B".repeat(24);
			expect((await setShareToken(db, audit.id, "u1", TOKEN))?.shareToken).toBe(
				TOKEN,
			);
			expect((await setShareToken(db, audit.id, "u1", other))?.shareToken).toBe(
				TOKEN,
			);
			expect(await getAuditByShareToken(db, other)).toBeNull();
			expect((await getAuditByShareToken(db, TOKEN))?.id).toBe(audit.id);
			await setShareToken(db, audit.id, "u1", null);
			expect((await setShareToken(db, audit.id, "u1", other))?.shareToken).toBe(
				other,
			);
		});

		it("returns null for another user, a running audit and an anonymous audit", async () => {
			const db = await setup();
			await seedUsers(db);
			const audit = await doneAudit(db, "u1");
			expect(await setShareToken(db, audit.id, "u2", TOKEN)).toBeNull();
			const running = await createAudit(
				db,
				{ ...input, userId: "u1" },
				noopEnqueue,
			);
			await claimAudit(db, running.id, { jobId: "job-1" });
			expect(await setShareToken(db, running.id, "u1", TOKEN)).toBeNull();
			const anon = await doneAudit(db, null);
			expect(await setShareToken(db, anon.id, "u1", TOKEN)).toBeNull();
		});

		it("finds nothing for a malformed token or a failed audit", async () => {
			const db = await setup();
			await seedUsers(db);
			const audit = await doneAudit(db, "u1");
			await setShareToken(db, audit.id, "u1", TOKEN);
			expect(await getAuditByShareToken(db, "short")).toBeNull();
			expect(await getAuditByShareToken(db, `${TOKEN}!`)).toBeNull();
			await db
				.update(audits)
				.set({ status: "failed" })
				.where(eq(audits.id, audit.id));
			expect(await getAuditByShareToken(db, TOKEN)).toBeNull();
		});
	});

	describe("listUserHistory", () => {
		it("pages the user's sites by their newest audit and returns all their audits", async () => {
			const db = await setup();
			await db.insert(users).values([
				{ id: "u1", email: "a@x.com", role: "user" },
				{ id: "u2", email: "b@x.com", role: "user" },
			]);
			const make = async (userId: string | null, url: string, day: number) => {
				const audit = await createAudit(
					db,
					{ ...input, url, userId },
					noopEnqueue,
				);
				await db
					.update(audits)
					.set({ createdAt: new Date(Date.UTC(2026, 9, day)) })
					.where(eq(audits.id, audit.id));
				return audit.id;
			};
			const a = "https://a.test/";
			const b = "https://b.test/";
			const c = "https://c.test/";
			const a1 = await make("u1", a, 1);
			const b2 = await make("u1", b, 2);
			const c3 = await make("u1", c, 3);
			const a4 = await make("u1", a, 4);
			await make("u2", b, 9);
			await make(null, c, 9);
			// Sites by newest audit: a (day 4), c (day 3), b (day 2).
			const first = await listUserHistory(db, "u1", { limit: 2 });
			expect(first.map((x) => x.id)).toEqual([a4, c3, a1]);
			const second = await listUserHistory(db, "u1", { limit: 2, offset: 2 });
			expect(second.map((x) => x.id)).toEqual([b2]);
			expect(await listUserHistory(db, "u1", { limit: 2, offset: 4 })).toEqual(
				[],
			);
			expect(await countUserSites(db, "u1")).toBe(3);
			expect(await countUserSites(db, "nobody")).toBe(0);
		});
	});

	describe("listAudits", () => {
		it("joins the email, filters by status, newest first and respects limit", async () => {
			const db = await setup();
			await db
				.insert(users)
				.values({ id: "u1", email: "a@x.com", role: "user" });
			const make = async (userId: string | null, day: number) => {
				const audit = await createAudit(db, { ...input, userId }, noopEnqueue);
				await db
					.update(audits)
					.set({ createdAt: new Date(Date.UTC(2026, 9, day)) })
					.where(eq(audits.id, audit.id));
				return audit.id;
			};
			const first = await make("u1", 1);
			const second = await make(null, 2);
			const third = await make("u1", 3);
			await failAudit(db, second, "boom");
			const all = await listAudits(db);
			expect(all.map((a) => a.id)).toEqual([third, second, first]);
			expect(all.map((a) => a.userEmail)).toEqual(["a@x.com", null, "a@x.com"]);
			const failed = await listAudits(db, { status: "failed" });
			expect(failed.map((a) => a.id)).toEqual([second]);
			expect(failed[0]?.error).toBe("boom");
			const limited = await listAudits(db, { limit: 2 });
			expect(limited.map((a) => a.id)).toEqual([third, second]);
			const next = await listAudits(db, { limit: 2, offset: 2 });
			expect(next.map((a) => a.id)).toEqual([first]);
			expect(await countAudits(db)).toBe(3);
			expect(await countAudits(db, { status: "failed" })).toBe(1);
			expect(await countAudits(db, { status: "running" })).toBe(0);
		});

		it("searches the url and the owner's email, literally, with the status", async () => {
			const db = await setup();
			await db.insert(users).values([
				{ id: "u1", email: "Alice@Mail.test", role: "user" },
				{ id: "u2", email: "bob_x@mail.test", role: "user" },
			]);
			const make = async (url: string, userId: string | null) =>
				(await createAudit(db, { ...input, url, userId }, noopEnqueue)).id;
			const shop = await make("https://Shop.example/", "u1");
			const blog = await make("https://blog.test/100%25", "u2");
			const anon = await make("https://anon.test/", null);
			const ids = async (search: string, status?: "failed") =>
				(await listAudits(db, { search, status })).map((a) => a.id).sort();
			expect(await ids("shop.EXAMPLE")).toEqual([shop]);
			expect(await ids("alice@")).toEqual([shop]);
			expect(await ids("mail.test")).toEqual([blog, shop].sort());
			expect(await ids("anon")).toEqual([anon]);
			// `_` and `%` match only themselves.
			expect(await ids("bo_x")).toEqual([]);
			expect(await ids("bob_x")).toEqual([blog]);
			expect(await ids("100%")).toEqual([blog]);
			expect(await ids("%")).toEqual([blog]);
			await failAudit(db, blog, "boom");
			expect(await ids("mail.test", "failed")).toEqual([blog]);
			expect(await countAudits(db, { search: "mail.test" })).toBe(2);
			expect(
				await countAudits(db, { search: "mail.test", status: "failed" }),
			).toBe(1);
		});
	});
});
