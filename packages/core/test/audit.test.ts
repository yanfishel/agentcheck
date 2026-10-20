import { Agent } from "undici";
import { describe, expect, it, vi } from "vitest";
import { guardedAuditOptions, runAudit } from "../src/audit.ts";
import { createGuardedBrowserRenderer } from "../src/browser/guarded.ts";
import {
	type BrowserRenderer,
	disabledRenderer,
} from "../src/browser/types.ts";
import { aiBotsAllowed } from "../src/checks/ai-bots-allowed.ts";
import { TargetUnreachableError } from "../src/context.ts";
import type { Check } from "../src/types.ts";
import { VERSION } from "../src/version.ts";
import { fakeRenderer, renderedPage } from "./helpers/fake-renderer.ts";
import { mockRoutes } from "./helpers/mock-site.ts";

const PAGE = { status: 200, contentType: "text/html", body: "<html></html>" };

describe("runAudit", () => {
	it("scores bot-access and skips the other categories", async () => {
		const agent = mockRoutes("https://example.com", {
			"/": PAGE,
			"/robots.txt": {
				status: 200,
				contentType: "text/plain",
				body: "User-agent: *\nAllow: /",
			},
		});
		const result = await runAudit("https://example.com/", {
			userAgent: "test",
			dispatcher: agent,
			checks: [aiBotsAllowed],
			now: () => new Date("2026-01-01T00:00:00.000Z"),
		});
		const byId = Object.fromEntries(result.categories.map((c) => [c.id, c]));
		expect(byId["bot-access"]?.score).toBe(100);
		expect(byId["ai-manifests"]?.status).toBe("skipped");
		expect(byId["content-semantics"]?.status).toBe("skipped");
		expect(byId["agentic-actionability"]?.status).toBe("skipped");
		expect(result.score).toBe(100);
		expect(result.grade).toBe("A+");
		expect(result.timestamp).toBe("2026-01-01T00:00:00.000Z");
		expect(result.finalUrl).toBe("https://example.com/");
		expect(result.tool.name).toBe("agentcheck");
	});

	it("reports the core version by default and a passed toolVersion otherwise", async () => {
		const run = (toolVersion?: string) =>
			runAudit("https://example.com/", {
				userAgent: "test",
				dispatcher: mockRoutes("https://example.com", {
					"/": PAGE,
					"/robots.txt": {
						status: 200,
						contentType: "text/plain",
						body: "User-agent: *\nAllow: /",
					},
				}),
				checks: [aiBotsAllowed],
				toolVersion,
			});
		expect((await run()).tool.version).toBe(VERSION);
		expect((await run("9.8.7")).tool.version).toBe("9.8.7");
	});

	it("turns a throwing check into a fail", async () => {
		const agent = mockRoutes("https://example.com", { "/": PAGE });
		const boom: Check = {
			id: "boom",
			category: "ai-manifests",
			title: "Boom",
			weight: 10,
			async run() {
				throw new Error("kaput");
			},
		};
		const result = await runAudit("https://example.com/", {
			userAgent: "test",
			dispatcher: agent,
			checks: [boom],
		});
		const check = result.categories.find((c) => c.id === "ai-manifests")
			?.checks[0];
		expect(check?.status).toBe("fail");
		expect(check?.message).toBe("Check crashed: kaput");
		expect(check?.remediation).toBe(
			"This is a bug in AgentCheck; please report it.",
		);
	});

	describe("browser info", () => {
		const renderCheck: Check = {
			id: "render",
			category: "agentic-actionability",
			title: "Render",
			weight: 10,
			async run(ctx) {
				await ctx.rendered();
				return { status: "pass", message: "ok" };
			},
		};
		const run = (checks: Check[], renderer?: BrowserRenderer) =>
			runAudit("https://example.com/", {
				userAgent: "test",
				dispatcher: mockRoutes("https://example.com", { "/": PAGE }),
				checks,
				renderer,
			});

		it("reports no browser use when no check renders", async () => {
			const quiet: Check = {
				...renderCheck,
				async run() {
					return { status: "pass", message: "ok" };
				},
			};
			const result = await run([quiet]);
			expect(result.browser).toEqual({
				used: false,
				reason: "No browser checks were run",
			});
		});

		it("reports the engine when a check renders", async () => {
			const renderer = fakeRenderer(
				renderedPage({ engine: "chromium", version: "9", renderMs: 4200 }),
			);
			const result = await run([renderCheck], renderer);
			expect(result.browser).toEqual({
				used: true,
				engine: "chromium",
				version: "9",
				renderMs: 4200,
			});
		});

		it("survives a throwing renderer", async () => {
			let seen: unknown;
			const probe: Check = {
				...renderCheck,
				async run(ctx) {
					seen = await ctx.rendered();
					return { status: "pass", message: "ok" };
				},
			};
			const renderer = {
				async render(): Promise<never> {
					throw new Error("boom");
				},
			};
			const result = await run([probe], renderer);
			expect(seen).toEqual({
				kind: "unavailable",
				reason: "Browser rendering failed: boom",
			});
			expect(result.browser).toEqual({
				used: false,
				reason: "Browser rendering failed: boom",
			});
		});

		it("reports the reason when the renderer is unavailable", async () => {
			const renderer = fakeRenderer({ kind: "unavailable", reason: "R" });
			const result = await run([renderCheck], renderer);
			expect(result.browser).toEqual({ used: false, reason: "R" });
		});
	});
});

describe("runAudit network guard", () => {
	it("rejects a private target as unreachable", async () => {
		const err = await runAudit("http://127.0.0.1/", {
			userAgent: "ua",
			network: { blockPrivate: true },
			checks: [],
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(TargetUnreachableError);
		expect((err as Error).message).toContain(
			"Target address is not allowed: address 127.0.0.1",
		);
	});

	it("rejects a hostname that only resolves to private addresses", async () => {
		const err = await runAudit("http://evil.test/", {
			userAgent: "ua",
			network: {
				blockPrivate: true,
				resolve: async () => [{ address: "192.168.0.1", family: 4 }],
			},
			checks: [],
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(TargetUnreachableError);
		expect((err as Error).message).toContain("Target address is not allowed");
	});

	it("closes the guarded agent after the audit settles", async () => {
		const close = vi.spyOn(Agent.prototype, "close");
		try {
			await runAudit("http://127.0.0.1/", {
				userAgent: "ua",
				network: { blockPrivate: true },
				checks: [],
			}).catch(() => undefined);
			expect(close).toHaveBeenCalled();
			expect(new Set(close.mock.contexts).size).toBe(1);
		} finally {
			close.mockRestore();
		}
	});

	it("rejects an unguarded real renderer before any request", async () => {
		const renderer = fakeRenderer({ kind: "rendered" } as never);
		await expect(
			runAudit("http://example.com/", {
				userAgent: "ua",
				network: { blockPrivate: true },
				renderer,
				checks: [],
			}),
		).rejects.toThrow(
			"network.blockPrivate requires createGuardedBrowserRenderer() or no browser",
		);
		expect(renderer.calls).toEqual([]);
	});

	it("accepts a guarded or disabled renderer with the guard on", async () => {
		for (const renderer of [
			createGuardedBrowserRenderer(),
			disabledRenderer(),
		]) {
			const err = await runAudit("http://127.0.0.1/", {
				userAgent: "ua",
				network: { blockPrivate: true },
				renderer,
				checks: [],
			}).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(TargetUnreachableError);
		}
	});

	it("builds guarded options for full and quick audits", () => {
		const full = guardedAuditOptions({
			userAgent: "ua",
			toolVersion: "9.9.9",
			browser: true,
		});
		expect(full.network).toEqual({ blockPrivate: true });
		expect(full.renderer?.guarded).toBe(true);
		expect(full.userAgent).toBe("ua");
		expect(full.toolVersion).toBe("9.9.9");
		const quick = guardedAuditOptions({ userAgent: "ua", browser: false });
		expect(quick.network).toEqual({ blockPrivate: true });
		expect(quick.renderer?.disabled).toBe(true);
	});

	it("forwards onScreenshot to the guarded renderer and keeps the option keys", async () => {
		const shots: unknown[] = [];
		const page = {
			goto: async () => ({ status: () => 200 }),
			waitForLoadState: async () => {},
			url: () => "http://site.test/",
			title: async () => "",
			content: async () => "",
			evaluate: async () => "UA",
			close: async () => {},
		};
		const context = {
			newPage: async () => page,
			newCDPSession: async () => ({
				send: async () => ({ data: Buffer.from("x").toString("base64") }),
			}),
			close: async () => {},
		};
		const browser = {
			version: () => "1.0.0",
			newContext: async () => context,
			close: async () => {},
		};
		const options = guardedAuditOptions({
			userAgent: "ua",
			browser: true,
			onScreenshot: (shot) => shots.push(shot),
			rendererOptions: {
				launcher: async () => browser as never,
				collect: async () => ({
					interactive: [],
					clickTraps: [],
					overlays: [],
					captcha: { markers: [], blocking: false },
				}),
				startProxy: async () =>
					({
						url: "http://127.0.0.1:1",
						refused: () => undefined,
						close: async () => {},
					}) as never,
			},
		});
		expect(Object.keys(options).sort()).toEqual([
			"network",
			"renderer",
			"toolVersion",
			"userAgent",
		]);
		const withIcon = guardedAuditOptions({
			userAgent: "ua",
			browser: false,
			onFavicon: () => {},
		});
		expect(Object.keys(withIcon).sort()).toEqual([
			"network",
			"onFavicon",
			"renderer",
			"toolVersion",
			"userAgent",
		]);
		const outcome = await options.renderer?.render("http://site.test/", {});
		expect(outcome?.kind).toBe("rendered");
		expect(shots).toHaveLength(1);
	});
});

describe("runAudit favicon", () => {
	const ICO = new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16]);
	const robots = {
		status: 200,
		contentType: "text/plain",
		body: "User-agent: *\nAllow: /",
	};
	const now = () => new Date("2026-01-01T00:00:00.000Z");
	const base = (agent: ReturnType<typeof mockRoutes>) => ({
		userAgent: "test",
		dispatcher: agent,
		checks: [aiBotsAllowed],
		now,
	});
	const routes = (icon: Record<string, unknown> = {}) => ({
		"/": PAGE,
		"/robots.txt": robots,
		"/favicon.ico": {
			status: 200,
			contentType: "image/x-icon",
			body: ICO,
			...icon,
		},
	});

	it("delivers the favicon once and leaves the result unchanged", async () => {
		const icons: unknown[] = [];
		const withCb = await runAudit("https://example.com/", {
			...base(mockRoutes("https://example.com", routes())),
			onFavicon: (icon) => icons.push(icon),
		});
		const without = await runAudit(
			"https://example.com/",
			base(mockRoutes("https://example.com", routes())),
		);
		expect(icons).toHaveLength(1);
		expect(icons[0]).toMatchObject({ contentType: "image/x-icon" });
		expect(withCb).toEqual(without);
	});

	it("no favicon fetch without onFavicon", async () => {
		const onRequest = vi.fn();
		const agent = mockRoutes("https://example.com", routes({ onRequest }));
		const result = await runAudit("https://example.com/", base(agent));
		expect(result.score).toBe(100);
		expect(onRequest).not.toHaveBeenCalled();
	});

	it("a hanging icon host does not hold the audit", async () => {
		const cb = vi.fn();
		const started = Date.now();
		await runAudit("https://example.com/", {
			...base(mockRoutes("https://example.com", routes({ delayMs: 3000 }))),
			onFavicon: cb,
			faviconBudgetMs: 50,
		});
		expect(Date.now() - started).toBeLessThan(2000);
		expect(cb).not.toHaveBeenCalled();
	});

	it("a throwing onFavicon never fails the audit", async () => {
		const result = await runAudit("https://example.com/", {
			...base(mockRoutes("https://example.com", routes())),
			onFavicon: () => {
				throw new Error("boom");
			},
		});
		expect(result.score).toBe(100);
	});
});
