import {
	audits,
	claimAudit,
	completeAudit,
	createAudit,
	setShareToken,
	users,
} from "@agentcheck/db";
import { createTestDb, type TestDbHandle } from "@agentcheck/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleBadge, renderBadge } from "@/server/badge";

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

describe("renderBadge", () => {
	it("draws two segments with the label and the score", () => {
		const svg = renderBadge({ score: 78, grade: "B" });
		expect(svg.startsWith("<svg")).toBe(true);
		expect(svg).toContain('role="img"');
		expect(svg).toContain("<title>AI Ready: 78/100</title>");
		expect(svg).toContain(">AI Ready<");
		expect(svg).toContain(">78/100<");
		expect(svg).toContain("#6e2a5e");
		// The XML namespace is the only URL allowed: no host, link or network request.
		expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(
			/https?:\/\//,
		);
		expect(svg).toMatchSnapshot();
	});
});

describe("handleBadge", () => {
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

	it("serves image/svg+xml with a day of public caching for a shared done audit", async () => {
		await sharedAudit();
		const res = await handleBadge(TOKEN, { db: handle.db });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe(
			"image/svg+xml; charset=utf-8",
		);
		expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
		expect(await res.text()).toContain(">87/100<");
	});

	it("404s for an unknown token and after unsharing", async () => {
		const missing = await handleBadge(TOKEN, { db: handle.db });
		expect(missing.status).toBe(404);
		// A cached "not found" would hide a badge shared a moment later.
		expect(missing.headers.get("cache-control")).toBe("no-store");
		const audit = await sharedAudit();
		await setShareToken(handle.db, audit.id, "owner", null);
		expect((await handleBadge(TOKEN, { db: handle.db })).status).toBe(404);
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
		expect((await handleBadge(TOKEN, { db: handle.db })).status).toBe(404);
	});
});
