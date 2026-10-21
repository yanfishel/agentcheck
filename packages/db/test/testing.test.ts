import { count } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { settings, users } from "../src/index.ts";
import { createTestDb, resetTestDb, startTestQueue } from "../src/testing.ts";

const user = {
	id: "user_1",
	email: "a@x.com",
	role: "user" as const,
	blocked: false,
};

describe("createTestDb", () => {
	it("hands the closed instance to the next call, wiped", async () => {
		const first = await createTestDb();
		await first.db.insert(users).values(user);
		await first.db.insert(settings).values({ id: 1 });
		await first.close();

		const second = await createTestDb();
		expect(second.client).toBe(first.client);
		expect(await second.db.select({ n: count() }).from(users)).toEqual([
			{ n: 0 },
		]);
		expect(await second.db.select({ n: count() }).from(settings)).toEqual([
			{ n: 0 },
		]);
		await second.close();
	});

	it("boots another instance while one is still in use", async () => {
		const first = await createTestDb();
		const second = await createTestDb();
		expect(second.client).not.toBe(first.client);
		await second.close();
		await first.close();
	});

	it("leaves a migrated schema behind the reset, and pg-boss restarts on it", async () => {
		const handle = await createTestDb();
		const queue = await startTestQueue(handle);
		await queue.stop();
		await resetTestDb(handle);

		const { rows } = await handle.client.query<{ n: string }>(
			"select count(*)::text as n from pg_namespace where nspname = 'pgboss'",
		);
		expect(rows).toEqual([{ n: "0" }]);
		await handle.db.insert(users).values(user);
		const again = await startTestQueue(handle);
		await again.stop();
		await handle.close();
	});
});
