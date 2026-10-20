import {
	getSettings,
	getUserById,
	type SyncedUser,
	users,
} from "@agentcheck/db";
import { createTestDb, type TestDbHandle } from "@agentcheck/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type AdminDeps,
	handleSetBlocked,
	handleUpdateLimits,
} from "@/server/admin";

vi.mock("server-only", () => ({}));

const adminUser: SyncedUser = {
	id: "admin",
	email: "a@x.com",
	role: "admin",
	blocked: false,
	created: false,
};

describe("handleSetBlocked", () => {
	let handle: TestDbHandle;
	let deps: AdminDeps;

	beforeEach(async () => {
		handle = await createTestDb();
		await handle.db.insert(users).values([
			{ id: "admin", email: "a@x.com", role: "admin" },
			{ id: "member", email: "m@x.com", role: "user" },
		]);
		deps = { db: handle.db, admin: async () => adminUser };
	});
	afterEach(async () => {
		await handle.close();
	});

	const patch = (id: string, body: unknown) =>
		handleSetBlocked(
			new Request("http://localhost/api/admin/users/x", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: typeof body === "string" ? body : JSON.stringify(body),
			}),
			id,
			deps,
		);

	it("blocks and unblocks a member", async () => {
		const res = await patch("member", { blocked: true });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: "member", blocked: true });
		expect((await getUserById(handle.db, "member"))?.blocked).toBe(true);

		const back = await patch("member", { blocked: false });
		expect(back.status).toBe(200);
		expect(await back.json()).toEqual({ id: "member", blocked: false });
		expect((await getUserById(handle.db, "member"))?.blocked).toBe(false);
	});

	it("refuses to toggle an admin", async () => {
		for (const blocked of [true, false]) {
			const res = await patch("admin", { blocked });
			expect(res.status).toBe(409);
			expect(await res.json()).toEqual({ error: "Admins cannot be blocked" });
		}
		expect((await getUserById(handle.db, "admin"))?.blocked).toBe(false);
	});

	it("returns 404 for an unknown user", async () => {
		const res = await patch("ghost", { blocked: true });
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "User not found" });
	});

	it("returns 400 for a bad body", async () => {
		for (const body of ["not json", {}, { blocked: "yes" }, [], null]) {
			const res = await patch("member", body);
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({
				error: "Expected JSON with blocked (true or false)",
			});
		}
	});
});

describe("handleUpdateLimits", () => {
	let handle: TestDbHandle;
	let deps: AdminDeps;

	beforeEach(async () => {
		handle = await createTestDb();
		deps = { db: handle.db, admin: async () => adminUser };
	});
	afterEach(async () => {
		await handle.close();
	});

	const limits = {
		anonQuickPerHour: 7,
		userFullPerDay: 8,
		userQuickPerDay: 9,
		hostPer10Min: 10,
		hostRunningMax: 3,
	};
	const put = (body: unknown) =>
		handleUpdateLimits(
			new Request("http://localhost/api/admin/settings", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: typeof body === "string" ? body : JSON.stringify(body),
			}),
			deps,
		);

	it("saves valid limits", async () => {
		const res = await put(limits);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(limits);
		expect(await getSettings(handle.db)).toEqual(limits);
	});

	it("rejects an invalid value with the validation message", async () => {
		const res = await put({ ...limits, hostRunningMax: 0 });
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "hostRunningMax must be an integer between 1 and 1000000",
		});
	});

	it("rejects a non-JSON body", async () => {
		const res = await put("not json");
		expect(res.status).toBe(400);
	});
});
