import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchBrowser } from "../../src/browser/launch.ts";
import type {
	BrowserLike,
	CdpLike,
	Collect,
	ContextLike,
	PageLike,
} from "../../src/browser/playwright-types.ts";
import { createBrowserRenderer } from "../../src/browser/render.ts";
import {
	type Screenshot,
	UNAVAILABLE_REASON,
} from "../../src/browser/types.ts";
import { VERSION } from "../../src/version.ts";
import {
	browserAvailable,
	type LocalServer,
	serveHtml,
} from "../helpers/local-server.ts";

interface FakeOptions {
	status?: number;
	gotoError?: Error;
	title?: string;
	html?: string;
	hang?: boolean;
	measureFails?: boolean;
	/** Makes Page.captureScreenshot reject. */
	captureFails?: boolean;
}

const emptyCollect: Collect = async () => ({
	interactive: [],
	clickTraps: [],
	overlays: [],
	captcha: { markers: [], blocking: false },
});

function fakeBrowser(opts: FakeOptions = {}) {
	const calls = {
		closed: 0,
		contextOpts: [] as unknown[],
		captures: [] as unknown[],
		order: [] as string[],
	};
	const page: PageLike = {
		async goto() {
			if (opts.hang) return new Promise(() => {});
			if (opts.gotoError) throw opts.gotoError;
			return { status: () => opts.status ?? 200 };
		},
		async waitForLoadState() {},
		url: () => "http://fake.test/",
		title: async () => opts.title ?? "",
		content: async () => opts.html ?? "<html></html>",
		evaluate: (async (script: unknown) => {
			if (opts.measureFails && typeof script === "string")
				throw new Error("measure boom");
			return "Mozilla/5.0 HeadlessChrome/1.0";
		}) as never,
		close: async () => {},
	};
	const context: ContextLike = {
		newPage: async () => page,
		newCDPSession: async () =>
			({
				send: async (method: string, params?: object) => {
					if (method !== "Page.captureScreenshot") return {};
					if (opts.captureFails) throw new Error("capture boom");
					calls.captures.push(params);
					calls.order.push("capture");
					return {
						data: Buffer.from(
							`shot-${(params as { clip: { scale: number } }).clip.scale}`,
						).toString("base64"),
					};
				},
			}) as CdpLike,
		close: async () => {},
	};
	const browser: BrowserLike = {
		version: () => "1.0.0",
		newContext: async (o) => {
			calls.contextOpts.push(o);
			return context;
		},
		close: async () => {
			calls.closed++;
		},
	};
	return { browser, calls };
}

describe("launchBrowser", () => {
	it("falls back to chromium when chrome fails", async () => {
		const { browser } = fakeBrowser();
		const result = await launchBrowser(async (engine) => {
			if (engine === "chrome") throw new Error("no chrome");
			return browser;
		});
		expect(result).toMatchObject({ engine: "chromium", version: "1.0.0" });
	});

	it("reports unavailable when every engine fails", async () => {
		const result = await launchBrowser(async () => {
			throw new Error("nope");
		});
		expect(result).toEqual({ kind: "unavailable", reason: UNAVAILABLE_REASON });
	});
});

describe("createBrowserRenderer with fakes", () => {
	const clip = (scale: number) => ({
		format: "webp",
		quality: 80,
		captureBeyondViewport: true,
		clip: { x: 0, y: 0, width: 1280, height: 800, scale },
	});

	it("captures a large and a small WebP before collecting when onScreenshot is set", async () => {
		const { browser, calls } = fakeBrowser();
		const shots: Screenshot[] = [];
		const renderer = createBrowserRenderer({
			launcher: async () => browser,
			collect: async (...args) => {
				calls.order.push("collect");
				return emptyCollect(...args);
			},
			onScreenshot: (shot) => shots.push(shot),
		});
		const result = await renderer.render("http://fake.test/", {});
		expect(result.kind).toBe("rendered");
		expect(shots).toHaveLength(1);
		expect(shots[0]?.contentType).toBe("image/webp");
		expect(Buffer.from(shots[0]?.large ?? []).toString()).toBe("shot-1");
		expect(Buffer.from(shots[0]?.small ?? []).toString()).toBe("shot-0.325");
		expect(calls.captures).toEqual([clip(1), clip(0.325)]);
		expect(calls.order).toEqual(["capture", "capture", "collect"]);
	});

	it("never captures without onScreenshot", async () => {
		const { browser, calls } = fakeBrowser();
		await createBrowserRenderer({
			launcher: async () => browser,
			collect: emptyCollect,
		}).render("http://fake.test/", {});
		expect(calls.captures).toEqual([]);
	});

	it("no screenshot for a challenge page", async () => {
		const { browser, calls } = fakeBrowser({
			status: 503,
			title: "Just a moment...",
		});
		let called = 0;
		const result = await createBrowserRenderer({
			launcher: async () => browser,
			collect: emptyCollect,
			onScreenshot: () => called++,
		}).render("http://fake.test/", {});
		expect(result.kind).toBe("rendered");
		if (result.kind === "rendered") {
			expect(result.captcha.markers).toContain("cloudflare-challenge");
		}
		expect(called).toBe(0);
		expect(calls.captures).toEqual([]);
	});

	it("no screenshot for an unavailable outcome", async () => {
		const { browser, calls } = fakeBrowser({ status: 500 });
		let called = 0;
		const result = await createBrowserRenderer({
			launcher: async () => browser,
			collect: emptyCollect,
			onScreenshot: () => called++,
		}).render("http://fake.test/", {});
		expect(result.kind).toBe("unavailable");
		expect(called).toBe(0);
		expect(calls.captures).toEqual([]);
	});

	it("a failed capture keeps the render", async () => {
		const { browser } = fakeBrowser({ captureFails: true });
		let called = 0;
		const result = await createBrowserRenderer({
			launcher: async () => browser,
			collect: emptyCollect,
			onScreenshot: () => called++,
		}).render("http://fake.test/", {});
		expect(result.kind).toBe("rendered");
		expect(called).toBe(0);
	});

	it("no late screenshot after the budget expires", async () => {
		const { browser } = fakeBrowser();
		let called = 0;
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const result = await createBrowserRenderer({
			launcher: async () => browser,
			collect: async (...args) => {
				await gate;
				return emptyCollect(...args);
			},
			budgetMs: 100,
			onScreenshot: () => called++,
		}).render("http://fake.test/", {});
		expect(result.kind).toBe("unavailable");
		release();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(called).toBe(0);
	});

	it("renders and closes the browser on success", async () => {
		const { browser, calls } = fakeBrowser();
		const renderer = createBrowserRenderer({
			launcher: async () => browser,
			collect: emptyCollect,
		});
		const result = await renderer.render("http://fake.test/", {});
		expect(result).toMatchObject({ kind: "rendered", status: 200 });
		expect(calls.closed).toBe(1);
		const ua = (calls.contextOpts.at(-1) as { userAgent: string }).userAgent;
		expect(ua).toBe(`Mozilla/5.0 Chrome/1.0 AgentCheck/${VERSION}`);
	});

	it("uses a passed toolVersion in the default user agent", async () => {
		const { browser, calls } = fakeBrowser();
		const renderer = createBrowserRenderer({
			launcher: async () => browser,
			collect: emptyCollect,
			toolVersion: "9.8.7",
		});
		await renderer.render("http://fake.test/", {});
		const ua = (calls.contextOpts.at(-1) as { userAgent: string }).userAgent;
		expect(ua).toBe("Mozilla/5.0 Chrome/1.0 AgentCheck/9.8.7");
	});

	it("closes the browser on navigation error", async () => {
		const { browser, calls } = fakeBrowser({
			gotoError: new Error("net::ERR_FAILED\nmore detail"),
		});
		const renderer = createBrowserRenderer({
			launcher: async () => browser,
			collect: emptyCollect,
		});
		const result = await renderer.render("http://fake.test/", {
			userAgent: "X/1",
		});
		expect(result).toEqual({
			kind: "unavailable",
			reason: "Browser navigation failed: net::ERR_FAILED",
		});
		expect(calls.closed).toBe(1);
	});

	it("closes the browser when collection throws and still reports an outcome", async () => {
		const { browser, calls } = fakeBrowser();
		const renderer = createBrowserRenderer({
			launcher: async () => browser,
			collect: async () => {
				throw new Error("collect boom");
			},
		});
		const result = await renderer.render("http://fake.test/", {});
		expect(result.kind).toBe("unavailable");
		expect(calls.closed).toBe(1);
	});

	it("reports unavailable when both collection halves fail", async () => {
		const { browser, calls } = fakeBrowser({ measureFails: true });
		const renderer = createBrowserRenderer({ launcher: async () => browser });
		const result = await renderer.render("http://fake.test/", {});
		expect(result.kind).toBe("unavailable");
		expect(calls.closed).toBe(1);
	});

	it("ignores a failing close()", async () => {
		const { browser } = fakeBrowser();
		browser.close = async () => {
			throw new Error("close failed");
		};
		const renderer = createBrowserRenderer({
			launcher: async () => browser,
			collect: emptyCollect,
		});
		const result = await renderer.render("http://fake.test/", {});
		expect(result.kind).toBe("rendered");
	});

	it("enforces the budget and closes the browser", async () => {
		const { browser, calls } = fakeBrowser({ hang: true });
		const renderer = createBrowserRenderer({
			launcher: async () => browser,
			budgetMs: 200,
		});
		const result = await renderer.render("http://fake.test/", {});
		expect(result).toEqual({
			kind: "unavailable",
			reason: "Page did not finish rendering within 0 s",
		});
		expect(calls.closed).toBeGreaterThanOrEqual(1);
	});

	it("returns within the budget when the launcher never resolves", async () => {
		const started = Date.now();
		let launchTimeout: number | undefined;
		const renderer = createBrowserRenderer({
			launcher: (_engine, timeoutMs) => {
				launchTimeout = timeoutMs;
				return new Promise(() => {});
			},
			budgetMs: 300,
		});
		const result = await renderer.render("http://fake.test/", {});
		expect(result).toEqual({
			kind: "unavailable",
			reason: "Page did not finish rendering within 0 s",
		});
		expect(Date.now() - started).toBeLessThan(1300);
		expect(launchTimeout).toBeGreaterThan(0);
		expect(launchTimeout).toBeLessThanOrEqual(300);
	});

	it("does not wait for a close() that never resolves, and kills the process", async () => {
		const { browser } = fakeBrowser();
		let killed = 0;
		browser.close = () => new Promise(() => {});
		browser.process = () => ({
			kill: () => {
				killed++;
				return true;
			},
		});
		const started = Date.now();
		const renderer = createBrowserRenderer({
			launcher: async () => browser,
			collect: emptyCollect,
			closeTimeoutMs: 200,
		});
		const result = await renderer.render("http://fake.test/", {});
		expect(result.kind).toBe("rendered");
		expect(Date.now() - started).toBeLessThan(2000);
		expect(killed).toBe(1);
	});

	it("resolves when close() hangs and the browser exposes no process", async () => {
		const { browser } = fakeBrowser();
		browser.close = () => new Promise(() => {});
		const renderer = createBrowserRenderer({
			launcher: async () => browser,
			collect: emptyCollect,
			closeTimeoutMs: 100,
		});
		expect((await renderer.render("http://fake.test/", {})).kind).toBe(
			"rendered",
		);
	});

	it("treats a throwing title()/content() probe as not a challenge", async () => {
		const { browser } = fakeBrowser({ status: 503 });
		const original = browser.newContext;
		browser.newContext = async (o) => {
			const ctx = await original(o);
			const newPage = ctx.newPage;
			ctx.newPage = async () => {
				const page = await newPage();
				page.title = async () => {
					throw new Error("Execution context was destroyed");
				};
				return page;
			};
			return ctx;
		};
		const renderer = createBrowserRenderer({
			launcher: async () => browser,
			collect: emptyCollect,
		});
		expect(await renderer.render("http://fake.test/", {})).toEqual({
			kind: "unavailable",
			reason: "Browser got HTTP 503",
		});
	});
});

const available = await browserAvailable();
if (!available)
	console.info("browser tests skipped: no Chromium-based browser");

// A real browser under the whole parallel suite can take longer than the
// default 5 s per test.
describe.skipIf(!available)(
	"createBrowserRenderer with a real browser",
	{ timeout: 20_000 },
	() => {
		let server: LocalServer;
		beforeAll(async () => {
			server = await serveHtml({
				"/ok": {
					body: "<html><title>Hi</title><body><h1>Hello</h1></body></html>",
				},
				"/missing": { status: 404, body: "<html><title>Nope</title></html>" },
				"/hang.css": {
					body: "body{}",
					contentType: "text/css",
					neverEnd: true,
				},
				"/slow": {
					body: '<html><head><link rel="stylesheet" href="/hang.css"></head><body>x</body></html>',
				},
				"/never": { body: "<html><body><p>start", neverEnd: true },
				"/tracker.gif": { body: "", contentType: "image/gif", neverEnd: true },
				"/tracker": {
					body: '<html><head><title>T</title></head><body><h1>Shop</h1><img src="/tracker.gif" alt=""></body></html>',
				},
				"/challenge": {
					status: 503,
					body: '<html><head><title>Just a moment...</title></head><body><script src="/challenge-platform/x.js"></script></body></html>',
				},
			});
		});
		afterAll(async () => {
			await server.close();
		});

		it("renders a 200 page", async () => {
			const result = await createBrowserRenderer().render(
				`${server.url}/ok`,
				{},
			);
			expect(result).toMatchObject({ kind: "rendered", status: 200 });
			if (result.kind === "rendered") {
				expect(["chrome", "chromium"]).toContain(result.engine);
				expect(result.renderMs).toBeGreaterThan(0);
				expect(result.finalUrl).toBe(`${server.url}/ok`);
			}
		});

		it("reports HTTP 404 as unavailable", async () => {
			const result = await createBrowserRenderer().render(
				`${server.url}/missing`,
				{},
			);
			expect(result).toEqual({
				kind: "unavailable",
				reason: "Browser got HTTP 404",
			});
		});

		it("gives up within the budget when the page itself never arrives", async () => {
			const started = Date.now();
			const result = await createBrowserRenderer({ budgetMs: 3000 }).render(
				`${server.url}/never`,
				{},
			);
			expect(result).toEqual({
				kind: "unavailable",
				reason: "Page did not finish rendering within 3 s",
			});
			expect(Date.now() - started).toBeLessThan(5000);
		});

		it("renders a page whose tracker never answers", async () => {
			const started = Date.now();
			const result = await createBrowserRenderer({
				budgetMs: 15_000,
				loadWaitMs: 1000,
			}).render(`${server.url}/tracker`, {});
			expect(result).toMatchObject({ kind: "rendered", status: 200 });
			expect(Date.now() - started).toBeLessThan(10_000);
		});

		it("renders a page whose stylesheet never ends", async () => {
			const result = await createBrowserRenderer({
				budgetMs: 15_000,
				loadWaitMs: 1000,
			}).render(`${server.url}/slow`, {});
			expect(result).toMatchObject({ kind: "rendered", status: 200 });
		});

		it("detects a Cloudflare challenge page", async () => {
			const result = await createBrowserRenderer().render(
				`${server.url}/challenge`,
				{},
			);
			expect(result).toMatchObject({
				kind: "rendered",
				status: 503,
				captcha: { blocking: true, markers: ["cloudflare-challenge"] },
			});
		});

		it("sends the AgentCheck user agent, or the one given", async () => {
			const renderer = createBrowserRenderer();
			await renderer.render(`${server.url}/ok`, {});
			const first = server.requests.filter((r) => r.path === "/ok").at(-1);
			expect(first?.userAgent).toMatch(new RegExp(` AgentCheck/${VERSION}$`));
			expect(first?.userAgent).not.toContain("HeadlessChrome");

			await renderer.render(`${server.url}/ok`, { userAgent: "X/1" });
			const second = server.requests.filter((r) => r.path === "/ok").at(-1);
			expect(second?.userAgent).toBe("X/1");
		});
	},
);
