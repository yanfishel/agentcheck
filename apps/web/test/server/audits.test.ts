import {
	audits,
	DEFAULT_LIMITS,
	type PgBoss,
	type QueueHandle,
	type SyncedUser,
	users,
} from "@agentcheck/db";
import {
	createTestDb,
	startTestQueue,
	type TestDbHandle,
} from "@agentcheck/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleStartAudit, type StartAuditRequestDeps } from "@/server/audits";

vi.mock("server-only", () => ({}));

const member: SyncedUser = {
	id: "user_1",
	email: "a@x.com",
	role: "user",
	blocked: false,
	created: false,
};

const anonymous = async () => ({ userId: null, user: null });

function post(body: unknown): Request {
	return new Request("http://localhost/api/audits", {
		method: "POST",
		body: typeof body === "string" ? body : JSON.stringify(body),
		headers: { "content-type": "application/json" },
	});
}

describe("handleStartAudit", () => {
	let handle: TestDbHandle;
	let queue: QueueHandle;
	let boss: PgBoss;

	beforeEach(async () => {
		handle = await createTestDb();
		queue = await startTestQueue(handle);
		boss = queue.boss;
	});

	afterEach(async () => {
		await queue.stop();
		await handle.close();
	});

	const deps = (
		viewer: StartAuditRequestDeps["viewer"] = anonymous,
	): StartAuditRequestDeps => ({
		db: handle.db,
		boss,
		viewer,
		ipHash: "h1",
		limits: async () => DEFAULT_LIMITS,
	});

	const jobs = async () =>
		(
			await handle.client.query<{ data: unknown }>(
				"select data from pgboss.job where name = 'audit'",
			)
		).rows.map((row) => row.data);

	it("queues an anonymous quick audit", async () => {
		const res = await handleStartAudit(
			post({ url: "example.com", mode: "quick" }),
			deps(),
		);
		expect(res.status).toBe(201);
		const body = await res.json();
		const rows = await handle.db.select().from(audits);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: body.id,
			url: "https://example.com/",
			host: "example.com",
			mode: "quick",
			status: "queued",
			userId: null,
		});
		expect(body).toEqual({ id: rows[0]?.id, status: "queued" });
		expect(await jobs()).toEqual([{ auditId: body.id }]);
	});

	it("stores the ip hash", async () => {
		await handleStartAudit(post({ url: "example.com", mode: "quick" }), deps());
		const rows = await handle.db.select().from(audits);
		expect(rows[0]?.ipHash).toBe("h1");
	});

	it("refuses the 6th anonymous quick audit with 429 and Retry-After", async () => {
		for (let i = 0; i < 5; i++) {
			const ok = await handleStartAudit(
				post({ url: `s${i}.test`, mode: "quick" }),
				deps(),
			);
			expect(ok.status).toBe(201);
		}
		const res = await handleStartAudit(
			post({ url: "s9.test", mode: "quick" }),
			deps(),
		);
		expect(res.status).toBe(429);
		expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
		expect(await res.json()).toMatchObject({
			error: expect.stringMatching(
				/^Too many checks from your network. Try again in /,
			),
			retryAfterSeconds: expect.any(Number),
		});
		expect(await handle.db.select().from(audits)).toHaveLength(5);
		expect(await jobs()).toHaveLength(5);
	});

	it("uses the stored limits", async () => {
		const tight = {
			...deps(),
			limits: async () => ({ ...DEFAULT_LIMITS, anonQuickPerHour: 1 }),
		};
		const first = await handleStartAudit(
			post({ url: "a.test", mode: "quick" }),
			tight,
		);
		expect(first.status).toBe(201);
		const second = await handleStartAudit(
			post({ url: "b.test", mode: "quick" }),
			tight,
		);
		expect(second.status).toBe(429);
	});

	it("returns 403 when the signed-in user has no users row", async () => {
		const res = await handleStartAudit(
			post({ url: "example.com", mode: "quick" }),
			deps(async () => ({ userId: "ghost", user: null })),
		);
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({
			error: "Your account is not available",
		});
	});

	it("records the signed-in user", async () => {
		await handle.db
			.insert(users)
			.values({ id: member.id, email: member.email, role: member.role });
		const res = await handleStartAudit(
			post({ url: "https://example.com/", mode: "quick" }),
			deps(async () => ({ userId: member.id, user: member })),
		);
		expect(res.status).toBe(201);
		const rows = await handle.db.select().from(audits);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.userId).toBe(member.id);
	});

	it("asks anonymous visitors to sign in for a full check", async () => {
		const res = await handleStartAudit(
			post({ url: "example.com", mode: "full" }),
			deps(),
		);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Sign in to run a full check" });
		expect(await handle.db.select().from(audits)).toEqual([]);
		expect(await jobs()).toEqual([]);
	});

	it("refuses blocked users", async () => {
		const res = await handleStartAudit(
			post({ url: "example.com", mode: "quick" }),
			deps(async () => ({
				userId: member.id,
				user: { ...member, blocked: true },
			})),
		);
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "Your account is blocked" });
		expect(await handle.db.select().from(audits)).toEqual([]);
	});

	it("refuses a private target with the policy message", async () => {
		const res = await handleStartAudit(
			post({ url: "http://127.0.0.1/", mode: "quick" }),
			deps(),
		);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "Target address is not allowed: address 127.0.0.1",
		});
		expect(await handle.db.select().from(audits)).toEqual([]);
		expect(await jobs()).toEqual([]);
	});

	it.each([
		["not JSON", "nope"],
		["a non-string url", { url: 1, mode: "quick" }],
		["an unknown mode", { url: "example.com", mode: "deep" }],
	])("rejects %s", async (_label, body) => {
		const res = await handleStartAudit(post(body), deps());
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "Expected JSON with url and mode (quick or full)",
		});
		expect(await handle.db.select().from(audits)).toEqual([]);
	});
});
