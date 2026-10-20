import { audits, createAudit, getUserById, syncUser } from "@agentcheck/db";
import { createTestDb, type TestDbHandle } from "@agentcheck/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleClerkWebhook } from "@/server/clerk-webhook";

vi.mock("server-only", () => ({}));

const request = () =>
	new Request("http://localhost/api/webhooks/clerk", { method: "POST" });

describe("handleClerkWebhook", () => {
	let handle: TestDbHandle;
	beforeEach(async () => {
		handle = await createTestDb();
		await syncUser(
			handle.db,
			{ id: "user_gone", primaryEmail: "g@x.com", primaryEmailVerified: true },
			{ adminEmail: "owner@x.com" },
		);
		await createAudit(
			handle.db,
			{
				url: "https://example.com/",
				host: "example.com",
				mode: "quick",
				userId: "user_gone",
			},
			async () => {},
		);
	});
	afterEach(async () => {
		await handle.close();
		vi.restoreAllMocks();
	});

	it("rejects a delivery whose signature does not verify, and touches nothing", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await handleClerkWebhook(request(), {
			db: handle.db,
			verify: async () => {
				throw new Error("bad signature");
			},
		});
		expect(response.status).toBe(400);
		expect(await getUserById(handle.db, "user_gone")).not.toBeNull();
	});

	it("deletes the user and their audits on user.deleted", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		const response = await handleClerkWebhook(request(), {
			db: handle.db,
			verify: async () =>
				({
					type: "user.deleted",
					data: { id: "user_gone", deleted: true, object: "user" },
				}) as never,
		});
		expect(response.status).toBe(200);
		expect(await getUserById(handle.db, "user_gone")).toBeNull();
		expect(await handle.db.select().from(audits)).toEqual([]);
	});

	it("acknowledges other events without changing anything", async () => {
		const response = await handleClerkWebhook(request(), {
			db: handle.db,
			verify: async () =>
				({ type: "user.updated", data: { id: "user_gone" } }) as never,
		});
		expect(response.status).toBe(200);
		expect(await getUserById(handle.db, "user_gone")).not.toBeNull();
	});
});
