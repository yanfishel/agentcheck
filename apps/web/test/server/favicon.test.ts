import {
	claimAudit,
	completeAudit,
	createAudit,
	setShareToken,
	users,
} from "@agentcheck/db";
import { createTestDb, type TestDbHandle } from "@agentcheck/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { faviconResponse, handleSharedFavicon } from "@/server/favicon";

vi.mock("server-only", () => ({}));

const TOKEN = "abcdefghijklmnopqrstuvwx";
const CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

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

const svg = new TextEncoder().encode(
	"<svg xmlns='http://www.w3.org/2000/svg'/>",
);

describe("faviconResponse", () => {
	it("serves the stored bytes with their type, nosniff and the cache policy", async () => {
		const icon = { contentType: "image/svg+xml", body: svg };
		const priv = faviconResponse(icon, "private");
		expect(priv.status).toBe(200);
		expect(priv.headers.get("content-type")).toBe("image/svg+xml");
		expect(priv.headers.get("x-content-type-options")).toBe("nosniff");
		expect(priv.headers.get("cache-control")).toBe("private, max-age=3600");
		expect(new Uint8Array(await priv.arrayBuffer())).toEqual(svg);
		expect(faviconResponse(icon, "shared").headers.get("cache-control")).toBe(
			"public, max-age=300",
		);
	});

	it("every favicon response carries the sandboxing CSP", () => {
		const icon = { contentType: "image/svg+xml", body: svg };
		expect(
			faviconResponse(icon, "private").headers.get("content-security-policy"),
		).toBe(CSP);
		const missing = faviconResponse(null, "shared");
		expect(missing.status).toBe(404);
		expect(missing.headers.get("content-security-policy")).toBe(CSP);
	});

	it("404 with no-store without an icon", () => {
		const res = faviconResponse(null, "private");
		expect(res.status).toBe(404);
		expect(res.headers.get("cache-control")).toBe("no-store");
	});
});

describe("handleSharedFavicon", () => {
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

	const req = () => new Request("http://x/favicon");

	async function doneAudit(withIcon: boolean) {
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
			...(withIcon
				? { favicon: { contentType: "image/svg+xml", body: svg } }
				: {}),
		});
		return audit;
	}

	it("serves the icon of a shared audit", async () => {
		const audit = await doneAudit(true);
		await setShareToken(handle.db, audit.id, "owner", TOKEN);
		const res = await handleSharedFavicon(req(), TOKEN, { db: handle.db });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/svg+xml");
		expect(res.headers.get("cache-control")).toBe("public, max-age=300");
		expect(res.headers.get("content-security-policy")).toBe(CSP);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(svg);
	});

	it("404 when the audit has no icon", async () => {
		const audit = await doneAudit(false);
		await setShareToken(handle.db, audit.id, "owner", TOKEN);
		const res = await handleSharedFavicon(req(), TOKEN, { db: handle.db });
		expect(res.status).toBe(404);
		expect(res.headers.get("cache-control")).toBe("no-store");
	});

	it("404 for an unknown token and after unshare", async () => {
		const deps = { db: handle.db };
		expect((await handleSharedFavicon(req(), TOKEN, deps)).status).toBe(404);
		const audit = await doneAudit(true);
		await setShareToken(handle.db, audit.id, "owner", TOKEN);
		expect((await handleSharedFavicon(req(), TOKEN, deps)).status).toBe(200);
		await setShareToken(handle.db, audit.id, "owner", null);
		const revoked = await handleSharedFavicon(req(), TOKEN, deps);
		expect(revoked.status).toBe(404);
		expect(revoked.headers.get("content-security-policy")).toBe(CSP);
	});
});
