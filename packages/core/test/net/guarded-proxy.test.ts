import { once } from "node:events";
import {
	createServer as createHttpServer,
	request as httpRequest,
	type IncomingMessage,
	type Server,
} from "node:http";
import {
	connect,
	createServer as createTcpServer,
	type Server as TcpServer,
} from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
	type GuardedProxy,
	startGuardedProxy,
} from "../../src/net/guarded-proxy.ts";

const LOOPBACK = "127.0.0.1";
const allowAll = () => false;
const resolveLoopback = async () => [{ address: LOOPBACK, family: 4 as const }];

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
	for (const fn of cleanups.splice(0)) await fn();
});

async function startTarget(): Promise<{
	port: number;
	hits: IncomingMessage[];
	server: Server;
}> {
	const hits: IncomingMessage[] = [];
	const server = createHttpServer((req, res) => {
		hits.push(req);
		if (req.url === "/redirect") {
			res.writeHead(302, { Location: "http://169.254.169.254/" });
			res.end();
			return;
		}
		res.writeHead(200, { "content-type": "text/plain" });
		res.end("hello");
	});
	server.listen(0, LOOPBACK);
	await once(server, "listening");
	cleanups.push(() => {
		server.closeAllConnections();
		server.close();
	});
	return { port: (server.address() as { port: number }).port, hits, server };
}

async function startEcho(): Promise<{ port: number; server: TcpServer }> {
	const server = createTcpServer((s) => {
		s.on("error", () => {});
		s.pipe(s);
	});
	server.listen(0, LOOPBACK);
	await once(server, "listening");
	cleanups.push(() => {
		server.close();
	});
	return { port: (server.address() as { port: number }).port, server };
}

async function startProxy(
	opts?: Parameters<typeof startGuardedProxy>[0],
): Promise<GuardedProxy> {
	const proxy = await startGuardedProxy(opts);
	cleanups.push(() => proxy.close());
	return proxy;
}

function proxyPort(proxy: GuardedProxy): number {
	return Number(new URL(proxy.url).port);
}

interface Reply {
	status: number;
	headers: Record<string, string | string[] | undefined>;
	body: string;
}

function viaProxy(
	proxy: GuardedProxy,
	target: string,
	headers: Record<string, string> = {},
): Promise<Reply> {
	return new Promise((resolve, reject) => {
		const req = httpRequest(
			{
				host: LOOPBACK,
				port: proxyPort(proxy),
				path: target,
				agent: false,
				headers,
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (c: Buffer) => chunks.push(c));
				res.on("end", () =>
					resolve({
						status: res.statusCode ?? 0,
						headers: res.headers,
						body: Buffer.concat(chunks).toString(),
					}),
				);
			},
		);
		req.on("error", reject);
		req.end();
	});
}

/** Sends a raw CONNECT and returns the status line, headers and the live socket. */
async function rawConnect(proxy: GuardedProxy, authority: string) {
	const socket = connect(proxyPort(proxy), LOOPBACK);
	cleanups.push(() => {
		socket.destroy();
	});
	socket.on("error", () => {});
	await once(socket, "connect");
	socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
	let buf = "";
	while (!buf.includes("\r\n\r\n")) {
		const [chunk] = (await once(socket, "data")) as [Buffer];
		buf += chunk.toString();
	}
	const [head] = buf.split("\r\n\r\n") as [string];
	const [statusLine, ...headerLines] = head.split("\r\n") as [
		string,
		...string[],
	];
	const headers = Object.fromEntries(
		headerLines.map((l) => {
			const i = l.indexOf(":");
			return [l.slice(0, i).toLowerCase(), l.slice(i + 1).trim()];
		}),
	);
	return { statusLine, headers, socket };
}

describe("startGuardedProxy: plain HTTP", () => {
	it("forwards to the vetted IP with the original Host header", async () => {
		const target = await startTarget();
		const proxy = await startProxy({
			resolve: resolveLoopback,
			isBlocked: allowAll,
			allowPorts: [target.port],
		});
		const res = await viaProxy(
			proxy,
			`http://allowed.test:${target.port}/hello?a=1`,
		);
		expect(res.status).toBe(200);
		expect(res.body).toBe("hello");
		expect(target.hits).toHaveLength(1);
		expect(target.hits[0]?.headers.host).toBe(`allowed.test:${target.port}`);
		expect(target.hits[0]?.url).toBe("/hello?a=1");
	});

	it("strips hop-by-hop headers", async () => {
		const target = await startTarget();
		const proxy = await startProxy({
			resolve: resolveLoopback,
			isBlocked: allowAll,
			allowPorts: [target.port],
		});
		await viaProxy(proxy, `http://allowed.test:${target.port}/`, {
			"Proxy-Authorization": "Basic abc",
			"Proxy-Connection": "keep-alive",
			"Keep-Alive": "timeout=5",
			"X-Custom": "kept",
		});
		const seen = target.hits[0]?.headers ?? {};
		expect(seen["proxy-authorization"]).toBeUndefined();
		expect(seen["proxy-connection"]).toBeUndefined();
		expect(seen["keep-alive"]).toBeUndefined();
		expect(seen["x-custom"]).toBe("kept");
	});

	it("does not follow redirects", async () => {
		const target = await startTarget();
		const proxy = await startProxy({
			resolve: resolveLoopback,
			isBlocked: allowAll,
			allowPorts: [target.port],
		});
		const res = await viaProxy(
			proxy,
			`http://allowed.test:${target.port}/redirect`,
		);
		expect(res.status).toBe(302);
		expect(res.headers.location).toBe("http://169.254.169.254/");
		expect(target.hits).toHaveLength(1);
	});

	it("refuses a private address under the default policy and never hits the target", async () => {
		const target = await startTarget();
		const proxy = await startProxy({
			resolve: resolveLoopback,
			allowPorts: [target.port],
		});
		const res = await viaProxy(
			proxy,
			`http://allowed.test:${target.port}/hello`,
		);
		expect(res.status).toBe(403);
		expect(res.headers["x-agentcheck-blocked"]).toBe("address 127.0.0.1");
		expect(target.hits).toHaveLength(0);
	});

	it("refuses localhost, IP literals and bad ports", async () => {
		const proxy = await startProxy({ resolve: resolveLoopback });
		const local = await viaProxy(proxy, "http://localhost/");
		expect(local.status).toBe(403);
		expect(local.headers["x-agentcheck-blocked"]).toBe("host localhost");
		const literal = await viaProxy(proxy, "http://169.254.169.254/latest");
		expect(literal.status).toBe(403);
		expect(literal.headers["x-agentcheck-blocked"]).toBe(
			"address 169.254.169.254",
		);
		const port = await viaProxy(proxy, "http://example.test:8080/");
		expect(port.status).toBe(403);
		expect(port.headers["x-agentcheck-blocked"]).toBe("port 8080");
	});

	it("answers 502 when the upstream refuses the connection", async () => {
		const dead = await startTarget();
		const port = dead.port;
		dead.server.closeAllConnections();
		dead.server.close();
		await once(dead.server, "close");
		const proxy = await startProxy({
			resolve: resolveLoopback,
			isBlocked: allowAll,
			allowPorts: [port],
		});
		const res = await viaProxy(proxy, `http://allowed.test:${port}/`);
		expect(res.status).toBe(502);
	});

	it("answers 400 to origin-form requests", async () => {
		const proxy = await startProxy();
		const res = await viaProxy(proxy, "/hello");
		expect(res.status).toBe(400);
	});

	it("connects to the first allowed address of a mixed DNS answer", async () => {
		const target = await startTarget();
		const proxy = await startProxy({
			resolve: async () => [
				{ address: "10.0.0.1", family: 4 },
				{ address: LOOPBACK, family: 4 },
			],
			isBlocked: (ip) => ip.startsWith("10."),
			allowPorts: [target.port],
		});
		const res = await viaProxy(proxy, `http://mixed.test:${target.port}/`);
		expect(res.status).toBe(200);
		expect(target.hits).toHaveLength(1);
	});
});

describe("startGuardedProxy: CONNECT", () => {
	it("refuses a disallowed port", async () => {
		const proxy = await startProxy({ resolve: resolveLoopback });
		const { statusLine, headers } = await rawConnect(proxy, "example.test:22");
		expect(statusLine).toBe("HTTP/1.1 403 Forbidden");
		expect(headers["x-agentcheck-blocked"]).toBe("port 22");
	});

	it("refuses a host that resolves only to blocked addresses", async () => {
		const proxy = await startProxy({
			resolve: async () => [
				{ address: "10.0.0.1", family: 4 },
				{ address: "192.168.0.1", family: 4 },
			],
		});
		const { statusLine, headers } = await rawConnect(proxy, "evil.test:443");
		expect(statusLine).toBe("HTTP/1.1 403 Forbidden");
		expect(headers["x-agentcheck-blocked"]).toBe(
			"no allowed address for evil.test",
		);
	});

	it("refuses localhost and blocked IP literals", async () => {
		const proxy = await startProxy({ resolve: resolveLoopback });
		const a = await rawConnect(proxy, "localhost:443");
		expect(a.headers["x-agentcheck-blocked"]).toBe("host localhost");
		const b = await rawConnect(proxy, "10.0.0.5:443");
		expect(b.headers["x-agentcheck-blocked"]).toBe("address 10.0.0.5");
		const c = await rawConnect(proxy, "[::1]:443");
		expect(c.statusLine).toBe("HTTP/1.1 403 Forbidden");
	});

	it("tunnels data to the vetted address", async () => {
		const echo = await startEcho();
		const proxy = await startProxy({
			resolve: resolveLoopback,
			isBlocked: allowAll,
			allowPorts: [echo.port],
		});
		const { statusLine, socket } = await rawConnect(
			proxy,
			`allowed.test:${echo.port}`,
		);
		expect(statusLine).toBe("HTTP/1.1 200 Connection Established");
		socket.write("ping");
		const [chunk] = (await once(socket, "data")) as [Buffer];
		expect(chunk.toString()).toBe("ping");
	});

	it("answers 502 when the upstream refuses the connection", async () => {
		const echo = await startEcho();
		const port = echo.port;
		echo.server.close();
		await once(echo.server, "close");
		const proxy = await startProxy({
			resolve: resolveLoopback,
			isBlocked: allowAll,
			allowPorts: [port],
		});
		const { statusLine } = await rawConnect(proxy, `allowed.test:${port}`);
		expect(statusLine).toBe("HTTP/1.1 502 Bad Gateway");
	});
});

describe("startGuardedProxy: lifecycle", () => {
	it("close() refuses new connections, destroys tunnels and is idempotent", async () => {
		const echo = await startEcho();
		const proxy = await startGuardedProxy({
			resolve: resolveLoopback,
			isBlocked: allowAll,
			allowPorts: [echo.port],
		});
		const port = proxyPort(proxy);
		const { socket } = await rawConnect(proxy, `allowed.test:${echo.port}`);
		const closed = once(socket, "close");
		await proxy.close();
		await closed;
		await proxy.close();
		const probe = connect(port, LOOPBACK);
		const [err] = (await once(probe, "error")) as [NodeJS.ErrnoException];
		expect(err.code).toBe("ECONNREFUSED");
	});
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("startGuardedProxy: hardening", () => {
	it("opens no upstream when closed during a slow resolve", async () => {
		const target = await startTarget();
		let connections = 0;
		target.server.on("connection", () => connections++);
		const proxy = await startGuardedProxy({
			resolve: async () => {
				await sleep(300);
				return [{ address: LOOPBACK, family: 4 }];
			},
			isBlocked: allowAll,
			allowPorts: [target.port],
		});
		const pending = viaProxy(proxy, `http://slow.test:${target.port}/`).catch(
			() => null,
		);
		await sleep(50);
		await proxy.close();
		await pending;
		await sleep(500);
		expect(connections).toBe(0);
	});

	it("opens no upstream when the client leaves during a slow resolve", async () => {
		const target = await startTarget();
		let connections = 0;
		target.server.on("connection", () => connections++);
		const proxy = await startProxy({
			resolve: async () => {
				await sleep(300);
				return [{ address: LOOPBACK, family: 4 }];
			},
			isBlocked: allowAll,
			allowPorts: [target.port],
		});
		const client = connect(proxyPort(proxy), LOOPBACK);
		client.on("error", () => {});
		await once(client, "connect");
		client.write(
			`GET http://slow.test:${target.port}/ HTTP/1.1\r\nHost: slow.test\r\n\r\n`,
		);
		await sleep(50);
		client.destroy();
		await sleep(500);
		expect(connections).toBe(0);
	});

	it("normalises IPv4-mapped literals before the policy", async () => {
		const proxy = await startProxy({
			isBlocked: (ip) => ip.startsWith("10."),
		});
		const { statusLine, headers } = await rawConnect(
			proxy,
			"[::ffff:10.0.0.1]:443",
		);
		expect(statusLine).toBe("HTTP/1.1 403 Forbidden");
		expect(headers["x-agentcheck-blocked"]).toBe("address 10.0.0.1");
	});

	it("strips headers named by Connection", async () => {
		const target = await startTarget();
		const proxy = await startProxy({
			resolve: resolveLoopback,
			isBlocked: allowAll,
			allowPorts: [target.port],
		});
		await viaProxy(proxy, `http://allowed.test:${target.port}/`, {
			Connection: "x-foo",
			"X-Foo": "1",
			"X-Bar": "2",
		});
		const seen = target.hits[0]?.headers ?? {};
		expect(seen["x-foo"]).toBeUndefined();
		expect(seen["x-bar"]).toBe("2");
	});

	it("answers 502 when resolution times out", async () => {
		const proxy = await startProxy({
			resolve: () => new Promise(() => {}),
			resolveTimeoutMs: 100,
		});
		const res = await viaProxy(proxy, "http://hang.test/");
		expect(res.status).toBe(502);
	});
});
