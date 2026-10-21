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

/**
 * Booted, migrated PGlite instances that no test holds right now. Booting
 * one takes about a second, so `close()` wipes the data and parks the
 * instance here instead, and the next `createTestDb()` takes it. Vitest
 * runs each test file in its own worker, so the pool is per file.
 */
const idle: PGlite[] = [];

/**
 * Empties every table the migrations created and drops pg-boss's schema, so
 * the next test starts from the state right after `migrate`. pg-boss
 * recreates its schema on `start()`. Any queue on the handle must be
 * stopped first.
 */
export async function resetTestDb(handle: TestDbHandle): Promise<void> {
	const { rows } = await handle.client.query<{ name: string }>(
		"select tablename as name from pg_tables where schemaname = 'public'",
	);
	if (rows.length > 0) {
		const tables = rows.map((row) => `"public"."${row.name}"`).join(", ");
		await handle.client.exec(`truncate ${tables} restart identity cascade`);
	}
	await handle.client.exec("drop schema if exists pgboss cascade");
}

/**
 * In-memory PGlite client with all migrations applied and no data (tests
 * only). `close()` wipes it and hands the instance to the next call in the
 * same test file, so a database per test costs milliseconds, not a boot.
 */
export async function createTestDb(): Promise<TestDbHandle> {
	const reused = idle.pop();
	const client = reused ?? new PGlite();
	const db = drizzlePglite(client, { schema });
	const handle: TestDbHandle = {
		db,
		close: async () => {
			await resetTestDb(handle);
			idle.push(client);
		},
		kind: "pglite",
		raw: db,
		client,
	};
	if (!reused) await migrate(handle);
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
