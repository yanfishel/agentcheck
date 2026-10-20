import {
	claimAudit,
	completeAudit,
	createAudit,
	getAuditScreenshot,
	setShareToken,
	users,
} from "@agentcheck/db";
import { createTestDb, type TestDbHandle } from "@agentcheck/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	handleSharedScreenshot,
	screenshotResponse,
	screenshotSize,
} from "@/server/screenshot";

vi.mock("server-only", () => ({}));

const TOKEN = "abcdefghijklmnopqrstuvwx";

const result = {
	tool: { name: "agentcheck", version: "0.1.0" },
	target: "https://example.com/",
	finalUrl: "https://example.com/",
	timestamp: "2026-10-19T00:00:00.000Z",
	categories: [],
	score: 87,
	grade: "B",
	browser: { used: false, reason: "disabled" },
} as const;

const small = new Uint8Array([1, 2, 3]);
const large = new Uint8Array([4, 5, 6, 7, 8]);

describe("screenshotSize", () => {
	it("is large only for ?size=large", () => {
		const s = (qs: string) => screenshotSize(new Request(`http://x/s${qs}`));
		expect(s("")).toBe("small");
		expect(s("?size=large")).toBe("large");
		expect(s("?size=huge")).toBe("small");
	});
});

describe("screenshotResponse", () => {
	it("serves the row with nosniff and the cache policy", async () => {
		const shot = { contentType: "image/webp", body: small };
		const priv = screenshotResponse(shot, "private");
		expect(priv.status).toBe(200);
		expect(priv.headers.get("content-type")).toBe("image/webp");
		expect(priv.headers.get("x-content-type-options")).toBe("nosniff");
		expect(priv.headers.get("cache-control")).toBe("private, max-age=3600");
		expect(new Uint8Array(await priv.arrayBuffer())).toEqual(small);
		expect(
			screenshotResponse(shot, "shared").headers.get("cache-control"),
		).toBe("public, max-age=300");
	});

	it("404 with no-store when there is no screenshot", () => {
		const res = screenshotResponse(null, "private");
		expect(res.status).toBe(404);
		expect(res.headers.get("cache-control")).toBe("no-store");
	});
});

describe("handleSharedScreenshot", () => {
	let handle: TestDbHandle;

	beforeEach(async () => {
		handle = await createTestDb();
		await handle.db
			.insert(users)
			.values({ id: "owner", email: "o@x.com", role: "user" });
	});
	afterEach(async () => {
		await handle.close();
	});

	const req = (qs = "") => new Request(`http://x/screenshot${qs}`);

	async function doneAudit(withShot: boolean) {
		const audit = await createAudit(
			handle.db,
			{
				url: "https://example.com/",
				host: "example.com",
				mode: "full",
				userId: "owner",
			},
			async () => {},
		);
		await claimAudit(handle.db, audit.id, { jobId: "job-1" });
		await completeAudit(handle.db, audit.id, {
			result: result as never,
			finalUrl: "https://example.com/",
			score: 87,
			grade: "B",
			...(withShot
				? { screenshot: { contentType: "image/webp", large, small } }
				: {}),
		});
		return audit;
	}

	it("serves the small image by default and the large one on ?size=large", async () => {
		const audit = await doneAudit(true);
		await setShareToken(handle.db, audit.id, "owner", TOKEN);
		const deps = { db: handle.db };
		const a = await handleSharedScreenshot(req(), TOKEN, deps);
		expect(a.status).toBe(200);
		expect(a.headers.get("content-type")).toBe("image/webp");
		expect(a.headers.get("x-content-type-options")).toBe("nosniff");
		expect(a.headers.get("cache-control")).toBe("public, max-age=300");
		expect(new Uint8Array(await a.arrayBuffer())).toEqual(small);
		const b = await handleSharedScreenshot(req("?size=large"), TOKEN, deps);
		expect(new Uint8Array(await b.arrayBuffer())).toEqual(large);
		expect(
			(await getAuditScreenshot(handle.db, audit.id, "large"))?.body,
		).toEqual(large);
	});

	it("404 with no-store when the audit has no screenshot", async () => {
		const audit = await doneAudit(false);
		await setShareToken(handle.db, audit.id, "owner", TOKEN);
		const res = await handleSharedScreenshot(req(), TOKEN, { db: handle.db });
		expect(res.status).toBe(404);
		expect(res.headers.get("cache-control")).toBe("no-store");
	});

	it("token route: 404 for an unknown or revoked token", async () => {
		const deps = { db: handle.db };
		const unknown = await handleSharedScreenshot(req(), TOKEN, deps);
		expect(unknown.status).toBe(404);
		expect(unknown.headers.get("cache-control")).toBe("no-store");
		const audit = await doneAudit(true);
		await setShareToken(handle.db, audit.id, "owner", TOKEN);
		expect((await handleSharedScreenshot(req(), TOKEN, deps)).status).toBe(200);
		await setShareToken(handle.db, audit.id, "owner", null);
		const revoked = await handleSharedScreenshot(req(), TOKEN, deps);
		expect(revoked.status).toBe(404);
		expect(revoked.headers.get("cache-control")).toBe("no-store");
	});
});
