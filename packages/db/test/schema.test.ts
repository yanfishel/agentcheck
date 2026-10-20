import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { users } from "../src/index.ts";
import { createTestDb } from "../src/testing.ts";

describe("users schema", () => {
	let close: (() => Promise<void>) | undefined;
	afterEach(async () => {
		await close?.();
		close = undefined;
	});

	it("stores and returns a user with defaults", async () => {
		const t = await createTestDb();
		close = t.close;
		await t.db
			.insert(users)
			.values({ id: "user_1", email: "a@example.com", role: "admin" });
		const [row] = await t.db.select().from(users).where(eq(users.id, "user_1"));
		expect(row?.email).toBe("a@example.com");
		expect(row?.role).toBe("admin");
		expect(row?.blocked).toBe(false);
		expect(row?.createdAt).toBeInstanceOf(Date);
	});

	it("rejects a duplicate id", async () => {
		const t = await createTestDb();
		close = t.close;
		await t.db
			.insert(users)
			.values({ id: "user_1", email: "a@example.com", role: "user" });
		await expect(
			t.db
				.insert(users)
				.values({ id: "user_1", email: "b@example.com", role: "user" }),
		).rejects.toThrow();
	});

	it("rejects an unknown role", async () => {
		const t = await createTestDb();
		close = t.close;
		await expect(
			t.db.insert(users).values({
				id: "user_2",
				email: "c@example.com",
				role: "root" as never,
			}),
		).rejects.toThrow();
	});

	it("allows the same email on different ids", async () => {
		const t = await createTestDb();
		close = t.close;
		await t.db
			.insert(users)
			.values({ id: "u1", email: "same@example.com", role: "user" });
		await t.db
			.insert(users)
			.values({ id: "u2", email: "same@example.com", role: "user" });
		expect(await t.db.select().from(users)).toHaveLength(2);
	});
});
