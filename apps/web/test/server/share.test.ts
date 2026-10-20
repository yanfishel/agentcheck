import {
	claimAudit,
	completeAudit,
	createAudit,
	getAudit,
	getAuditByShareToken,
	type SyncedUser,
	users,
} from "@agentcheck/db";
import { createTestDb, type TestDbHandle } from "@agentcheck/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	handleShare,
	handleUnshare,
	publicOrigin,
	type ShareDeps,
	shareUrl,
	shareUrlFromHeaders,
} from "@/server/share";

vi.mock("server-only", () => ({}));

const owner: SyncedUser = {
	id: "owner",
	email: "o@x.com",
	role: "user",
	blocked: false,
	created: false,
};
const other: SyncedUser = { ...owner, id: "other", email: "x@x.com" };
const admin: SyncedUser = {
	...owner,
	id: "admin",
	email: "a@x.com",
	role: "admin",
};

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

const noop = async () => {};

describe("share", () => {
	let handle: TestDbHandle;

	beforeEach(async () => {
		handle = await createTestDb();
		await handle.db.insert(users).values([
			{ id: "owner", email: "o@x.com", role: "user" },
			{ id: "other", email: "x@x.com", role: "user" },
			{ id: "admin", email: "a@x.com", role: "admin" },
		]);
	});
	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	const make = async (userId: string | null, finish = true) => {
		const audit = await createAudit(
			handle.db,
			{
				url: "https://example.com/",
				host: "example.com",
				mode: "quick",
				userId,
			},
			noop,
		);
		if (finish) {
			await claimAudit(handle.db, audit.id, { jobId: "job-1" });
			await completeAudit(handle.db, audit.id, {
				result: result as never,
				finalUrl: "https://example.com/",
				score: 87,
				grade: "B",
			});
		}
		return audit;
	};
	const deps = (viewer: SyncedUser | null): ShareDeps => ({
		db: handle.db,
		viewer: async () => viewer,
	});
	const req = (method: string, id: string) =>
		new Request(`http://localhost:3000/api/audits/${id}/share`, { method });

	it("shares a done audit for its owner and reuses the token", async () => {
		const audit = await make("owner");
		const res = await handleShare(req("POST", audit.id), audit.id, deps(owner));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.shareToken).toHaveLength(24);
		expect(body.url).toBe(`http://localhost:3000/r/${body.shareToken}`);
		const again = await handleShare(
			req("POST", audit.id),
			audit.id,
			deps(owner),
		);
		expect((await again.json()).shareToken).toBe(body.shareToken);
	});

	it("answers concurrent creates with the one stored token", async () => {
		const audit = await make("owner");
		const [a, b] = await Promise.all([
			handleShare(req("POST", audit.id), audit.id, deps(owner)),
			handleShare(req("POST", audit.id), audit.id, deps(owner)),
		]);
		const stored = (await getAudit(handle.db, audit.id))?.shareToken;
		expect((await a.json()).shareToken).toBe(stored);
		expect((await b.json()).shareToken).toBe(stored);
		expect((await getAuditByShareToken(handle.db, stored ?? ""))?.id).toBe(
			audit.id,
		);
	});

	it("honours PUBLIC_BASE_URL", () => {
		const request = req("POST", "x");
		expect(
			shareUrl("tok", request, { PUBLIC_BASE_URL: "https://agentcheck.dev" }),
		).toBe("https://agentcheck.dev/r/tok");
		expect(shareUrl("tok", request, {})).toBe("http://localhost:3000/r/tok");
	});

	it("returns 404 to other signed-in users and signed-out visitors", async () => {
		const audit = await make("owner");
		for (const viewer of [other, null]) {
			const res = await handleShare(
				req("POST", audit.id),
				audit.id,
				deps(viewer),
			);
			expect(res.status).toBe(404);
			expect(await res.json()).toEqual({ error: "Not found" });
		}
		expect((await getAudit(handle.db, audit.id))?.shareToken).toBeNull();
	});

	it("returns 404 for unknown and malformed ids", async () => {
		const res = await handleShare(req("POST", "nope"), "nope", deps(owner));
		expect(res.status).toBe(404);
	});

	it("returns 403 to a non-owner admin and for anonymous audits", async () => {
		const owned = await make("owner");
		const anon = await make(null);
		const cases: [string, SyncedUser | null][] = [
			[owned.id, admin],
			[anon.id, null],
			[anon.id, owner],
		];
		for (const [id, viewer] of cases) {
			const res = await handleShare(req("POST", id), id, deps(viewer));
			expect(res.status).toBe(403);
			expect(await res.json()).toEqual({
				error: "Only the owner can share this audit",
			});
		}
	});

	it("returns 409 for an unfinished audit", async () => {
		const audit = await make("owner", false);
		const res = await handleShare(req("POST", audit.id), audit.id, deps(owner));
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({
			error: "Only finished audits can be shared",
		});
	});

	it("unshares idempotently", async () => {
		const audit = await make("owner");
		const body = await (
			await handleShare(req("POST", audit.id), audit.id, deps(owner))
		).json();
		const res = await handleUnshare(
			req("DELETE", audit.id),
			audit.id,
			deps(owner),
		);
		expect(res.status).toBe(204);
		expect(await getAuditByShareToken(handle.db, body.shareToken)).toBeNull();
		const twice = await handleUnshare(
			req("DELETE", audit.id),
			audit.id,
			deps(owner),
		);
		expect(twice.status).toBe(204);
	});

	it("does not unshare for other viewers", async () => {
		const audit = await make("owner");
		const res = await handleUnshare(
			req("DELETE", audit.id),
			audit.id,
			deps(other),
		);
		expect(res.status).toBe(404);
	});
});

describe("publicOrigin", () => {
	it("prefers PUBLIC_BASE_URL", () => {
		const headers = new Headers({ host: "evil.test" });
		expect(
			publicOrigin(headers, { PUBLIC_BASE_URL: "https://agentcheck.dev" }),
		).toBe("https://agentcheck.dev");
	});

	it("falls back to the forwarded host and proto, http for localhost", () => {
		expect(
			publicOrigin(
				new Headers({
					"x-forwarded-host": "app.test",
					"x-forwarded-proto": "https",
				}),
				{},
			),
		).toBe("https://app.test");
		expect(publicOrigin(new Headers({ host: "localhost:3000" }), {})).toBe(
			"http://localhost:3000",
		);
	});

	it("never trusts request headers in production", () => {
		const headers = new Headers({
			host: "evil.test",
			"x-forwarded-host": "evil.test",
		});
		expect(
			publicOrigin(headers, {
				NODE_ENV: "production",
				PUBLIC_BASE_URL: "https://agentcheck.dev/",
			}),
		).toBe("https://agentcheck.dev");
		expect(() => publicOrigin(headers, { NODE_ENV: "production" })).toThrow(
			"PUBLIC_BASE_URL is not set",
		);
	});

	it("is the base of the share URL", () => {
		const headers = new Headers({ host: "localhost:3000" });
		expect(shareUrlFromHeaders("tok", headers, {})).toBe(
			`${publicOrigin(headers, {})}/r/tok`,
		);
	});
});
