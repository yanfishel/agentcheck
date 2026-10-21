import type { Favicon, FinishedCheck } from "@agentcheck/core";
import { count, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { QueueHandle } from "../src/index.ts";
import {
	auditFavicons,
	claimAudit,
	completeAudit,
	createAudit,
	type Db,
	failAudit,
	failStaleAudits,
	getAudit,
	recordAuditCheck,
	saveAuditFavicon,
} from "../src/index.ts";
import { createTestDb, startTestQueue } from "../src/testing.ts";

const input = {
	url: "https://example.com/",
	host: "example.com",
	mode: "quick" as const,
	userId: null,
};
const noopEnqueue = async () => {};

const check = (id: string): FinishedCheck => ({
	id,
	category: "ai-manifests",
	title: id,
	weight: 1,
	status: "pass",
	message: `${id} ok`,
});

const early: Favicon = {
	contentType: "image/png",
	body: new Uint8Array([1, 2, 3]),
};
const late: Favicon = {
	contentType: "image/x-icon",
	body: new Uint8Array([9, 9]),
};

describe("audit progress", () => {
	let close: (() => Promise<void>) | undefined;
	let queue: QueueHandle | undefined;
	afterEach(async () => {
		await queue?.stop();
		queue = undefined;
		await close?.();
		close = undefined;
	});
	const setup = async (opts: { queue?: boolean } = {}): Promise<Db> => {
		const t = await createTestDb();
		close = t.close;
		if (opts.queue) queue = await startTestQueue(t);
		return t.db;
	};
	const running = async (db: Db, jobId = "job-A", now?: () => Date) => {
		const audit = await createAudit(db, input, noopEnqueue);
		await claimAudit(db, audit.id, { jobId, now });
		return audit.id;
	};
	const faviconRows = async (db: Db, id: string) => {
		const [row] = await db
			.select({ n: count() })
			.from(auditFavicons)
			.where(eq(auditFavicons.auditId, id));
		return row?.n;
	};

	it("recordAuditCheck merges checks of the claiming job", async () => {
		const db = await setup();
		const id = await running(db);
		expect(await recordAuditCheck(db, id, "job-A", check("llms-txt"))).toBe(
			true,
		);
		expect(await recordAuditCheck(db, id, "job-A", check("robots"))).toBe(true);
		const audit = await getAudit(db, id);
		expect(Object.keys(audit?.partial ?? {}).sort()).toEqual([
			"llms-txt",
			"robots",
		]);
		expect(audit?.partial?.["llms-txt"]).toEqual(check("llms-txt"));
	});

	it("recordAuditCheck is a no-op unless running and claimed by the job", async () => {
		const db = await setup();
		const id = await running(db);
		expect(await recordAuditCheck(db, id, "job-B", check("a"))).toBe(false);
		expect((await getAudit(db, id))?.partial).toBeNull();
		await failAudit(db, id, "boom");
		expect(await recordAuditCheck(db, id, "job-A", check("a"))).toBe(false);
		expect((await getAudit(db, id))?.partial).toBeNull();
	});

	it("saveAuditFavicon stores the icon and the flag", async () => {
		const db = await setup();
		const id = await running(db);
		expect(await saveAuditFavicon(db, id, "job-B", early)).toBe(false);
		expect(await faviconRows(db, id)).toBe(0);
		expect(await saveAuditFavicon(db, id, "job-A", early)).toBe(true);
		expect((await getAudit(db, id))?.hasFavicon).toBe(true);
		expect(await faviconRows(db, id)).toBe(1);
	});

	it("claim clears partial data and an early favicon", async () => {
		const db = await setup();
		const id = await running(db);
		await recordAuditCheck(db, id, "job-A", check("a"));
		await saveAuditFavicon(db, id, "job-A", early);
		const again = await claimAudit(db, id, { jobId: "job-A" });
		expect(again.kind).toBe("claimed");
		const audit = await getAudit(db, id);
		expect(audit?.partial).toBeNull();
		expect(audit?.hasFavicon).toBe(false);
		expect(await faviconRows(db, id)).toBe(0);
	});

	it("completeAudit clears partial and upserts an early favicon", async () => {
		const db = await setup();
		const id = await running(db);
		await recordAuditCheck(db, id, "job-A", check("a"));
		await saveAuditFavicon(db, id, "job-A", early);
		const ok = await completeAudit(db, id, {
			result: {} as never,
			finalUrl: "https://example.com/",
			score: 50,
			grade: "C",
			favicon: late,
		});
		expect(ok).toBe(true);
		const audit = await getAudit(db, id);
		expect(audit?.partial).toBeNull();
		expect(audit?.hasFavicon).toBe(true);
		const rows = await db
			.select()
			.from(auditFavicons)
			.where(eq(auditFavicons.auditId, id));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.contentType).toBe("image/x-icon");
		expect(Array.from(rows[0]?.body ?? [])).toEqual([9, 9]);
	});

	it("completeAudit keeps an early favicon when none is given", async () => {
		const db = await setup();
		const id = await running(db);
		await saveAuditFavicon(db, id, "job-A", early);
		await completeAudit(db, id, {
			result: {} as never,
			finalUrl: "https://example.com/",
			score: 50,
			grade: "C",
		});
		expect((await getAudit(db, id))?.hasFavicon).toBe(true);
		expect(await faviconRows(db, id)).toBe(1);
	});

	it("failAudit clears partial and the early favicon", async () => {
		const db = await setup();
		const id = await running(db);
		await recordAuditCheck(db, id, "job-A", check("a"));
		await saveAuditFavicon(db, id, "job-A", early);
		expect(await failAudit(db, id, "boom")).toBe(true);
		const audit = await getAudit(db, id);
		expect(audit?.partial).toBeNull();
		expect(audit?.hasFavicon).toBe(false);
		expect(await faviconRows(db, id)).toBe(0);
	});

	it("failAudit on a done audit keeps its favicon", async () => {
		const db = await setup();
		const id = await running(db);
		await completeAudit(db, id, {
			result: {} as never,
			finalUrl: "https://example.com/",
			score: 50,
			grade: "C",
			favicon: early,
		});
		expect(await failAudit(db, id, "boom")).toBe(false);
		expect((await getAudit(db, id))?.hasFavicon).toBe(true);
		expect(await faviconRows(db, id)).toBe(1);
	});

	it("failStaleAudits clears partial and the early favicon of a stale running audit", async () => {
		const db = await setup({ queue: true });
		const T0 = new Date("2026-10-19T12:00:00.000Z");
		const id = await running(
			db,
			"job-A",
			() => new Date(T0.getTime() - 6 * 60_000),
		);
		await recordAuditCheck(db, id, "job-A", check("a"));
		await saveAuditFavicon(db, id, "job-A", early);
		const fresh = await running(
			db,
			"job-A",
			() => new Date(T0.getTime() - 60_000),
		);
		await recordAuditCheck(db, fresh, "job-A", check("b"));
		await saveAuditFavicon(db, fresh, "job-A", early);

		expect(await failStaleAudits(db, () => T0)).toBe(1);
		const audit = await getAudit(db, id);
		expect(audit?.status).toBe("failed");
		expect(audit?.partial).toBeNull();
		expect(audit?.hasFavicon).toBe(false);
		expect(await faviconRows(db, id)).toBe(0);
		const other = await getAudit(db, fresh);
		expect(other?.partial).not.toBeNull();
		expect(other?.hasFavicon).toBe(true);
		expect(await faviconRows(db, fresh)).toBe(1);
	});
});
