import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { type DbHandle, migrationsFolder } from "./client.ts";
import { type QueueHandle, startQueue } from "./queue.ts";
import * as schema from "./schema.ts";

export interface TestDbHandle extends DbHandle {
	/** The underlying PGlite instance, for raw queries and pg-boss. */
	client: PGlite;
}

/** Applies the SQL migrations to a PGlite handle (tests only). */
export async function migrate(handle: DbHandle): Promise<void> {
	await migratePglite(
		handle.raw as ReturnType<typeof drizzlePglite<typeof schema>>,
		{ migrationsFolder },
	);
}

/** In-memory PGlite client with all migrations applied (tests only). */
export async function createTestDb(): Promise<TestDbHandle> {
	const client = new PGlite();
	const db = drizzlePglite(client, { schema });
	const handle: TestDbHandle = {
		db,
		close: () => client.close(),
		kind: "pglite",
		raw: db,
		client,
	};
	await migrate(handle);
	return handle;
}

/**
 * Starts pg-boss on the test database (tests only). Stop it before closing
 * the handle, otherwise its timers keep the process alive.
 */
export function startTestQueue(handle: TestDbHandle): Promise<QueueHandle> {
	return startQueue(
		{ pglite: handle.client },
		{ supervise: false, schedule: false, stopTimeoutMs: 2000 },
	);
}
