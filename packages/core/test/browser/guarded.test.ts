import { createSocket } from "node:dgram";
import { createServer } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGuardedBrowserRenderer } from "../../src/browser/guarded.ts";
import type { BrowserLike } from "../../src/browser/playwright-types.ts";
import { createBrowserRenderer } from "../../src/browser/render.ts";
import type { Resolve } from "../../src/net/guarded-lookup.ts";
import { startGuardedProxy } from "../../src/net/guarded-proxy.ts";
import { BLOCKED_PREFIX } from "../../src/net/policy.ts";
import {
	browserAvailable,
	type LocalServer,
	serveHtml,
} from "../helpers/local-server.ts";

const available = await browserAvailable();
if (!available)
	console.info("browser tests skipped: no Chromium-based browser");

const resolve: Resolve = async (host) => {
	if (host === "site.test") return [{ address: "127.0.0.1", family: 4 }];
	if (host === "evil.test") return [{ address: "10.0.0.1", family: 4 }];
	throw new Error("ENOTFOUND");
};

/** Permissive policy: only 10.0.0.1 is blocked, so loopback test servers are reachable. */
const permissive = (ip: string) => ip === "10.0.0.1";

function refused(port: number): Promise<boolean> {
	return new Promise((done) => {
		const socket = connect({ host: "127.0.0.1", port });
		socket.once("connect", () => {
			socket.destroy();
			done(false);
		});
		socket.once("error", () => done(true));
	});
}

describe("createGuardedBrowserRenderer without a browser", () => {
	it("refuses a blocked URL before launching anything", async () => {
		const launches: string[] = [];
		const renderer = createGuardedBrowserRenderer({
			launcher: async (engine) => {
				launches.push(engine);
				return {} as BrowserLike;
			},
		});
		const result = await renderer.render("http://localhost/", {});
		expect(result).toEqual({
			kind: "unavailable",
			reason: "Target address is not allowed: host localhost",
			blocked: true,
		});
		expect(launches).toEqual([]);
	});
});

describe.skipIf(!available)(
	"createGuardedBrowserRenderer with a real browser",
	{ timeout: 20_000 },
	() => {
		let server: LocalServer;
		beforeAll(async () => {
			server = await serveHtml({
				"/": {
					body: "<html><title>Hi</title><body><h1>Hello</h1></body></html>",
				},
				"/embed": {
					body: '<html><body><img src="http://evil.test/x.png"><p>ok</p></body></html>',
				},
				"/slow": { body: "<html></html>", delayMs: 20_000 },
			});
		});
		afterAll(async () => {
			await server.close();
		});

		it("renders a permitted page through the proxy", async () => {
			const renderer = createGuardedBrowserRenderer({
				resolve,
				isBlocked: permissive,
				allowPorts: [server.port],
			});
			const result = await renderer.render(
				`http://site.test:${server.port}/`,
				{},
			);
			expect(result.kind).toBe("rendered");
			expect(
				server.requests.some((r) => r.host === `site.test:${server.port}`),
			).toBe(true);
		});

		it("blocks a loopback target under the default policy", async () => {
			const renderer = createGuardedBrowserRenderer({
				resolve,
				allowPorts: [server.port],
			});
			const result = await renderer.render(
				`http://site.test:${server.port}/`,
				{},
			);
			expect(result).toEqual({
				kind: "unavailable",
				reason: "Target address is not allowed: address 127.0.0.1",
				blocked: true,
			});
		});

		it("sends loopback URLs through the proxy too", async () => {
			const proxy = await startGuardedProxy({ allowPorts: [server.port] });
			try {
				const before = server.requests.length;
				const result = await createBrowserRenderer({
					proxyServer: proxy.url,
				}).render(`${server.url}/`, {});
				expect(result).toEqual({
					kind: "unavailable",
					reason: BLOCKED_PREFIX,
					blocked: true,
				});
				expect(server.requests.length).toBe(before);
			} finally {
				await proxy.close();
			}
		});

		it.skipIf(process.platform === "darwin")(
			"never contacts a blocked subresource host",
			async () => {
				const victimHosts: string[] = [];
				const victim = createServer((req, res) => {
					victimHosts.push(String(req.headers.host));
					res.end("x");
				});
				await new Promise<void>((done) => victim.listen(0, "127.0.0.2", done));
				const victimPort = (victim.address() as AddressInfo).port;
				try {
					const blockedHost = (ip: string) => ip === "127.0.0.2";
					const embedServer = await serveHtml({
						"/": {
							body: `<html><body><img src="http://evil.test:${victimPort}/x.png"><p>ok</p></body></html>`,
						},
					});
					try {
						const renderer = createGuardedBrowserRenderer({
							resolve: async (host) => {
								if (host === "site.test")
									return [{ address: "127.0.0.1", family: 4 }];
								if (host === "evil.test")
									return [{ address: "127.0.0.2", family: 4 }];
								throw new Error("ENOTFOUND");
							},
							isBlocked: blockedHost,
							allowPorts: [embedServer.port, victimPort],
						});
						const result = await renderer.render(
							`http://site.test:${embedServer.port}/`,
							{},
						);
						expect(result.kind).toBe("rendered");
						expect(victimHosts).toEqual([]);
					} finally {
						await embedServer.close();
					}
				} finally {
					await new Promise<void>((done) => victim.close(() => done()));
				}
			},
		);

		it("does not let WebRTC send UDP to private addresses", async () => {
			const packets: Buffer[] = [];
			const udp = createSocket("udp4");
			udp.on("message", (m) => packets.push(m));
			await new Promise<void>((done) => udp.bind(0, "127.0.0.1", done));
			const udpPort = udp.address().port;
			try {
				const rtcServer = await serveHtml({
					"/": {
						body: `<html><body><script>
const pc = new RTCPeerConnection({ iceServers: [
  { urls: "stun:127.0.0.1:${udpPort}" },
  { urls: "turn:127.0.0.1:${udpPort}?transport=udp", username: "u", credential: "c" },
] });
pc.createDataChannel("x");
pc.createOffer().then((o) => pc.setLocalDescription(o));
fetch("/hold");
</script></body></html>`,
					},
					"/hold": { body: "x", delayMs: 3000 },
				});
				try {
					const renderer = createGuardedBrowserRenderer({
						resolve,
						isBlocked: permissive,
						allowPorts: [rtcServer.port],
						settleMs: 5000,
					});
					const result = await renderer.render(
						`http://site.test:${rtcServer.port}/`,
						{},
					);
					expect(result.kind).toBe("rendered");
					expect(packets).toHaveLength(0);
				} finally {
					await rtcServer.close();
				}
			} finally {
				udp.close();
			}
		}, 30_000);

		it("rejects a page that navigates to a private address after load", async () => {
			const victim = await serveHtml({ "/": { body: "<html>secret</html>" } });
			try {
				const jump = await serveHtml({
					"/": {
						body: `<html><body><script>setTimeout(() => { location = "http://127.0.0.1:${victim.port}/"; }, 300);</script></body></html>`,
					},
				});
				try {
					const renderer = createGuardedBrowserRenderer({
						resolve,
						isBlocked: permissive,
						allowPorts: [jump.port, victim.port],
						settleMs: 3000,
					});
					const result = await renderer.render(
						`http://site.test:${jump.port}/`,
						{},
					);
					expect(result).toEqual({
						kind: "unavailable",
						reason: "Target address is not allowed: address 127.0.0.1",
						blocked: true,
					});
				} finally {
					await jump.close();
				}
			} finally {
				await victim.close();
			}
		}, 30_000);

		it("rejects a page that navigates to a hostname the proxy refuses", async () => {
			const jump = await serveHtml({
				"/": {
					body: `<html><body><script>setTimeout(() => { location = "http://evil.test:" + location.port + "/"; }, 300);</script></body></html>`,
				},
			});
			try {
				const renderer = createGuardedBrowserRenderer({
					resolve: async (host) => {
						if (host === "site.test")
							return [{ address: "127.0.0.1", family: 4 }];
						if (host === "evil.test")
							return [{ address: "10.0.0.1", family: 4 }];
						throw new Error("ENOTFOUND");
					},
					isBlocked: permissive,
					allowPorts: [jump.port],
					settleMs: 3000,
				});
				const result = await renderer.render(
					`http://site.test:${jump.port}/`,
					{},
				);
				expect(result).toEqual({
					kind: "unavailable",
					reason: "Target address is not allowed: address 10.0.0.1",
					blocked: true,
				});
			} finally {
				await jump.close();
			}
		}, 30_000);

		it("does not report an unreachable https host as blocked", async () => {
			const renderer = createGuardedBrowserRenderer({
				resolve: async () => {
					throw new Error("ENOTFOUND");
				},
			});
			const result = await renderer.render("https://nowhere.test/", {});
			expect(result).toEqual({
				kind: "unavailable",
				reason: "Browser navigation failed: could not connect to nowhere.test",
			});
		});

		it("closes the proxy after success, error and timeout", async () => {
			const ports: number[] = [];
			const startProxy: typeof startGuardedProxy = async (o) => {
				const proxy = await startGuardedProxy(o);
				ports.push(Number(new URL(proxy.url).port));
				return proxy;
			};
			const base = {
				resolve,
				isBlocked: permissive,
				allowPorts: [server.port],
				startProxy,
			};
			await createGuardedBrowserRenderer(base).render(
				`http://site.test:${server.port}/`,
				{},
			);
			await createGuardedBrowserRenderer(base).render(
				`http://nowhere.test:${server.port}/`,
				{},
			);
			const timeout = await createGuardedBrowserRenderer({
				...base,
				budgetMs: 3000,
			}).render(`http://site.test:${server.port}/slow`, {});
			expect(timeout.kind).toBe("unavailable");
			expect(ports).toHaveLength(3);
			for (const port of ports) expect(await refused(port)).toBe(true);
		}, 60_000);
	},
);
