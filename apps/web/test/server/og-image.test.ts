import {
	audits,
	claimAudit,
	completeAudit,
	createAudit,
	setShareToken,
	setUserBlocked,
	users,
} from "@agentcheck/db";
import { createTestDb, type TestDbHandle } from "@agentcheck/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOgCache, handleOgImage } from "@/server/og-image";

vi.mock("server-only", () => ({}));

const TOKEN = "abcdefghijklmnopqrstuvwx";
const PNG = new Uint8Array([137, 80, 78, 71]);

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

describe("createOgCache", () => {
	it("drops the least recently used entry past its size", () => {
		const cache = createOgCache(2);
		cache.set("a", PNG);
		cache.set("b", PNG);
		cache.set("c", PNG);
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("c")).toBeDefined();
	});

	it("keeps an entry that was read recently", () => {
		const cache = createOgCache(2);
		cache.set("a", PNG);
		cache.set("b", PNG);
		cache.get("a");
		cache.set("c", PNG);
		expect(cache.get("a")).toBeDefined();
		expect(cache.get("b")).toBeUndefined();
	});
});

describe("handleOgImage", () => {
	let handle: TestDbHandle;
	const draw = vi.fn(async () => PNG);

	beforeEach(async () => {
		draw.mockClear();
		handle = await createTestDb();
		await handle.db
			.insert(users)
			.values({ id: "owner", email: "o@x.com", role: "user" });
	});
	afterEach(async () => {
		await handle.close();
	});

	const sharedAudit = async () => {
		const audit = await createAudit(
			handle.db,
			{
				url: "https://example.com/",
				host: "example.com",
				mode: "quick",
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
		});
		await setShareToken(handle.db, audit.id, "owner", TOKEN);
		return audit;
	};
	const request = (cache = createOgCache()) =>
		handleOgImage(TOKEN, { db: handle.db, draw, cache });

	it("serves a PNG with five minutes of public caching for a shared done audit", async () => {
		await sharedAudit();
		const res = await request();
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/png");
		expect(res.headers.get("cache-control")).toBe("public, max-age=300");
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
		expect(draw).toHaveBeenCalledWith({
			host: "example.com",
			score: 87,
			grade: "B",
		});
	});

	it("draws once for two requests", async () => {
		await sharedAudit();
		const cache = createOgCache();
		await request(cache);
		await request(cache);
		expect(draw).toHaveBeenCalledTimes(1);
	});

	it("404s with no-store for an unknown token", async () => {
		const res = await request();
		expect(res.status).toBe(404);
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(draw).not.toHaveBeenCalled();
	});

	it("404s after unsharing even when the picture is cached", async () => {
		const audit = await sharedAudit();
		const cache = createOgCache();
		expect((await request(cache)).status).toBe(200);
		await setShareToken(handle.db, audit.id, "owner", null);
		expect((await request(cache)).status).toBe(404);
	});

	it("404s once the owner is blocked, even when cached", async () => {
		await sharedAudit();
		const cache = createOgCache();
		expect((await request(cache)).status).toBe(200);
		await setUserBlocked(handle.db, "owner", true);
		expect((await request(cache)).status).toBe(404);
	});

	it("404s for a token whose audit is not done", async () => {
		await handle.db.insert(audits).values({
			url: "https://example.com/",
			host: "example.com",
			mode: "quick",
			userId: "owner",
			status: "queued",
			shareToken: TOKEN,
		});
		expect((await request()).status).toBe(404);
		expect(draw).not.toHaveBeenCalled();
	});
});
