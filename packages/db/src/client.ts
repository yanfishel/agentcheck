import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema.ts";

/**
 * The common base of the node-postgres and PGlite Drizzle databases, so code
 * such as `syncUser` accepts either. Both satisfy it structurally.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbHandle = {
	db: Db;
	close(): Promise<void>;
	/** Explicit discriminator used by `migrate` (no duck-typing). */
	kind: "pg" | "pglite";
	/** @internal the concrete Drizzle instance, kept for the migrators. */
	raw: unknown;
};

// Built with path functions (not `new URL(...)`) so bundlers do not try to
// resolve the migrations folder as a module.
export const migrationsFolder = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"drizzle",
);

/**
 * How long a new connection may take before it fails. node-postgres waits
 * forever by default, which would hang web requests and the worker while
 * Postgres is unreachable.
 */
export const DEFAULT_CONNECTION_TIMEOUT_MS = 5000;

/** Production/dev client: a node-postgres Pool. */
export function createDb(
	url: string,
	opts: { connectionTimeoutMs?: number } = {},
): DbHandle {
	const pool = new pg.Pool({
		connectionString: url,
		connectionTimeoutMillis:
			opts.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
	});
	const db = drizzlePg(pool, { schema });
	return { db, close: () => pool.end(), kind: "pg", raw: db };
}

/** Applies the SQL migrations from `packages/db/drizzle/`. */
export async function migrate(handle: DbHandle): Promise<void> {
	if (handle.kind !== "pg") {
		throw new Error(
			"Only pg handles can be migrated here; use migrate from @agentcheck/db/testing for PGlite.",
		);
	}
	await migratePg(handle.raw as ReturnType<typeof drizzlePg<typeof schema>>, {
		migrationsFolder,
	});
}
