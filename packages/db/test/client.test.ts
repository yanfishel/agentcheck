import { createServer, type Server, type Socket } from "node:net";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createDb,
	type DbHandle,
	DEFAULT_CONNECTION_TIMEOUT_MS,
	startQueue,
} from "../src/index.ts";

/**
 * A TCP server that accepts connections and never answers, like a Postgres
 * host that is up at the network level but stuck. Without a connect timeout
 * node-postgres waits on it forever.
 */
let server: Server;
let sockets: Socket[];
let url: string;

beforeEach(async () => {
	sockets = [];
	server = createServer((socket) => {
		sockets.push(socket);
		socket.on("error", () => {});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("no port");
	}
	url = `postgres://user:pass@127.0.0.1:${address.port}/db`;
});

afterEach(async () => {
	for (const socket of sockets) socket.destroy();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("connection timeouts", () => {
	let handle: DbHandle | undefined;

	afterEach(async () => {
		await handle?.close().catch(() => {});
		handle = undefined;
	});

	it("createDb gives the pool the default 5 s connect timeout", () => {
		handle = createDb(url);
		// Checked on the pool's options rather than by waiting the 5 s out.
		const { $client: pool } = handle.raw as unknown as {
			$client: { options: { connectionTimeoutMillis?: number } };
		};
		expect(DEFAULT_CONNECTION_TIMEOUT_MS).toBe(5000);
		expect(pool.options.connectionTimeoutMillis).toBe(
			DEFAULT_CONNECTION_TIMEOUT_MS,
		);
	});

	it("createDb accepts a custom connect timeout", async () => {
		handle = createDb(url, { connectionTimeoutMs: 300 });
		const started = Date.now();
		await expect(handle.db.execute(sql`select 1`)).rejects.toThrow();
		expect(Date.now() - started).toBeLessThan(2000);
	}, 15_000);

	it("startQueue gives up connecting after its connect timeout", async () => {
		const started = Date.now();
		await expect(
			startQueue(
				{ connectionString: url, connectionTimeoutMs: 300 },
				{ supervise: false, onError: () => {} },
			),
		).rejects.toThrow();
		// pg-boss start waits on two connections in a row before giving up;
		// the point is that it fails instead of hanging. The default timeout
		// itself is pinned by the createDb test above.
		expect(Date.now() - started).toBeLessThan(5_000);
	}, 15_000);
});
