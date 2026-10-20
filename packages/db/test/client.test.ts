import { createServer, type Server, type Socket } from "node:net";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DbHandle, startQueue } from "../src/index.ts";

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

	it("createDb gives up connecting after the default 5 s", async () => {
		handle = createDb(url);
		const started = Date.now();
		await expect(handle.db.execute(sql`select 1`)).rejects.toThrow();
		const elapsed = Date.now() - started;
		expect(elapsed).toBeGreaterThanOrEqual(4500);
		expect(elapsed).toBeLessThan(6500);
	}, 15_000);

	it("createDb accepts a custom connect timeout", async () => {
		handle = createDb(url, { connectionTimeoutMs: 300 });
		const started = Date.now();
		await expect(handle.db.execute(sql`select 1`)).rejects.toThrow();
		expect(Date.now() - started).toBeLessThan(2000);
	}, 15_000);

	it("startQueue gives up connecting after the default 5 s", async () => {
		const started = Date.now();
		await expect(
			startQueue(
				{ connectionString: url },
				{ supervise: false, onError: () => {} },
			),
		).rejects.toThrow();
		// pg-boss start waits on two connections in a row (about 10 s here)
		// before giving up; the point is that it fails instead of hanging.
		expect(Date.now() - started).toBeLessThan(12_500);
	}, 20_000);
});
