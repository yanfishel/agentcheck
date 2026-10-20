import { BLOCKED_PREFIX } from "../net/policy.ts";
import { VERSION } from "../version.ts";
import { collectRenderedData } from "./collect.ts";
import { type Launcher, launchBrowser } from "./launch.ts";
import type {
	BrowserLike,
	CdpLike,
	Collect,
	CollectedData,
	ContextLike,
	PageLike,
} from "./playwright-types.ts";
import {
	type BrowserRenderer,
	type RenderedPage,
	type RenderOutcome,
	SCREENSHOT_LARGE,
	SCREENSHOT_SMALL,
	type Screenshot,
} from "./types.ts";

export interface RendererOptions {
	launcher?: Launcher;
	collect?: Collect;
	budgetMs?: number;
	settleMs?: number;
	/**
	 * How long to wait for the load event once the DOM is ready (default
	 * LOAD_WAIT_MS). A subresource that never answers (a stuck tracker pixel)
	 * holds `load` back forever; past this the page is checked as it stands.
	 */
	loadWaitMs?: number;
	/** How long to wait for browser.close() before killing the process. */
	closeTimeoutMs?: number;
	/** Version of the running tool for the default User-Agent suffix; defaults to the core package version. */
	toolVersion?: string;
	/** Chromium's own sandbox; the guarded renderer always turns it on. */
	sandbox?: boolean;
	/**
	 * @internal Forces all browser traffic through this proxy (loopback included).
	 * Not a guard by itself; use createGuardedBrowserRenderer.
	 */
	proxyServer?: string;
	/**
	 * @internal Vets the final page URL after load (catches redirects into the proxy's refusal page).
	 * Not a guard by itself; use createGuardedBrowserRenderer.
	 */
	isUrlAllowed?: (url: string) => boolean;
	/**
	 * Opt-in: called once with a first-screen screenshot of a successfully rendered
	 * page (never for a challenge page, an unavailable outcome or after the budget
	 * expired). A failed capture is dropped silently.
	 */
	onScreenshot?: (shot: Screenshot) => void;
}

export const BLOCKED_REASON = BLOCKED_PREFIX;
const BLOCKED_HEADER = "x-agentcheck-blocked";

const CHALLENGE_STATUSES = new Set([403, 429, 503]);

/** Captures the top-left clip of the page at `scale`; WebP, quality 80. */
async function captureClip(cdp: CdpLike, scale: number): Promise<Uint8Array> {
	const { data } = (await cdp.send("Page.captureScreenshot", {
		format: "webp",
		quality: 80,
		captureBeyondViewport: true,
		clip: {
			x: 0,
			y: 0,
			width: SCREENSHOT_LARGE.width,
			height: SCREENSHOT_LARGE.height,
			scale,
		},
	})) as { data: string };
	return new Uint8Array(Buffer.from(data, "base64"));
}

/** Longest wait for the load event after the DOM is ready. */
export const LOAD_WAIT_MS = 10_000;

class BudgetExceeded extends Error {}

async function quietly(action: () => Promise<unknown>): Promise<void> {
	try {
		await action();
	} catch {
		// ignored on purpose
	}
}

/** Closes the browser, never waiting longer than `timeoutMs`; kills the process on timeout. */
async function closeBrowser(
	browser: BrowserLike,
	timeoutMs: number,
): Promise<void> {
	let timer: NodeJS.Timeout | undefined;
	const timedOut = Symbol("timeout");
	const closing = (async () => browser.close())().catch(() => undefined);
	const timeout = new Promise<typeof timedOut>((resolve) => {
		timer = setTimeout(() => resolve(timedOut), timeoutMs);
	});
	try {
		if ((await Promise.race([closing, timeout])) === timedOut) {
			try {
				browser.process?.()?.kill();
			} catch {
				// nothing more to do
			}
		}
	} finally {
		clearTimeout(timer);
	}
}

async function defaultUserAgent(
	browser: BrowserLike,
	toolVersion: string,
): Promise<string> {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		const ua = await page.evaluate(() => navigator.userAgent);
		return `${ua.replace("HeadlessChrome", "Chrome")} AgentCheck/${toolVersion}`;
	} finally {
		await quietly(() => context.close());
	}
}

async function isChallenge(page: PageLike, status: number): Promise<boolean> {
	if (!CHALLENGE_STATUSES.has(status)) return false;
	try {
		const title = await page.title();
		if (title.startsWith("Just a moment")) return true;
		const html = await page.content();
		return html.includes("challenge-platform") || html.includes("cf-chl");
	} catch {
		// A mid-navigation error means we cannot tell; treat it as not a challenge.
		return false;
	}
}

export function createBrowserRenderer(
	opts: RendererOptions = {},
): BrowserRenderer {
	const budgetMs = opts.budgetMs ?? 30_000;
	const settleMs = opts.settleMs ?? 2_000;
	const loadWaitMs = opts.loadWaitMs ?? LOAD_WAIT_MS;
	const collect = opts.collect ?? collectRenderedData;
	const closeTimeoutMs = opts.closeTimeoutMs ?? 5_000;
	const toolVersion = opts.toolVersion ?? VERSION;

	return {
		async render(url, { userAgent }): Promise<RenderOutcome> {
			const started = performance.now();
			let browser: BrowserLike | undefined;
			let aborted = false;

			const work = async (): Promise<RenderOutcome> => {
				const launched = await launchBrowser(
					opts.launcher,
					() => Math.max(1, budgetMs - (performance.now() - started)),
					opts.proxyServer,
					opts.sandbox,
				);
				if ("kind" in launched) return launched;
				browser = launched.browser;
				if (aborted) {
					// The budget expired while launching; the outer finally ran already.
					await closeBrowser(launched.browser, closeTimeoutMs);
					throw new BudgetExceeded();
				}

				const ua = userAgent ?? (await defaultUserAgent(browser, toolVersion));
				const context: ContextLike = await browser.newContext({
					viewport: { width: 1280, height: 800 },
					locale: "en-US",
					userAgent: ua,
				});
				const page = await context.newPage();

				let status: number;
				try {
					// The DOM, not every subresource: a stuck tracker never fires load.
					const response = await page.goto(url, {
						waitUntil: "domcontentloaded",
					});
					if (!response) {
						return {
							kind: "unavailable",
							reason: "Browser navigation failed: no response",
						};
					}
					if (response.headers?.()[BLOCKED_HEADER] !== undefined) {
						return {
							kind: "unavailable",
							reason: BLOCKED_REASON,
							blocked: true,
						};
					}
					status = response.status();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (message.includes("ERR_TUNNEL_CONNECTION_FAILED")) {
						return {
							kind: "unavailable",
							reason: BLOCKED_REASON,
							blocked: true,
						};
					}
					return {
						kind: "unavailable",
						reason: `Browser navigation failed: ${message.split("\n")[0]}`,
					};
				}

				await quietly(() =>
					page.waitForLoadState("load", { timeout: loadWaitMs }),
				);
				await quietly(() =>
					page.waitForLoadState("networkidle", { timeout: settleMs }),
				);

				if (opts.isUrlAllowed && !opts.isUrlAllowed(page.url())) {
					return {
						kind: "unavailable",
						reason: BLOCKED_REASON,
						blocked: true,
					};
				}

				const challenge = await isChallenge(page, status);
				if (!challenge && (status < 200 || status >= 300)) {
					return { kind: "unavailable", reason: `Browser got HTTP ${status}` };
				}

				let shot: Screenshot | undefined;
				let data: CollectedData;
				if (challenge) {
					data = {
						interactive: [],
						clickTraps: [],
						overlays: [],
						captcha: {
							markers: ["cloudflare-challenge"],
							blocking: true,
							reason: "Cloudflare challenge page",
						},
					};
				} else {
					const cdp = await context.newCDPSession(page);
					if (opts.onScreenshot) {
						try {
							const large = await captureClip(cdp, 1);
							const small = await captureClip(
								cdp,
								SCREENSHOT_SMALL.width / SCREENSHOT_LARGE.width,
							);
							shot = { contentType: "image/webp", large, small };
						} catch {
							// A failed capture never fails the render.
						}
					}
					data = await collect(page, cdp);
				}

				const rendered: RenderedPage = {
					kind: "rendered",
					engine: launched.engine,
					version: launched.version,
					renderMs: Math.max(1, Math.round(performance.now() - started)),
					status,
					finalUrl: page.url(),
					...data,
				};
				if (shot && !aborted) {
					try {
						opts.onScreenshot?.(shot);
					} catch {
						// A failing callback never fails the render.
					}
				}
				return rendered;
			};

			let timer: NodeJS.Timeout | undefined;
			const budget = new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new BudgetExceeded()), budgetMs);
			});
			const working = work();
			working.catch(() => {});

			try {
				return await Promise.race([working, budget]);
			} catch (error) {
				if (error instanceof BudgetExceeded) {
					aborted = true;
					return {
						kind: "unavailable",
						reason: `Page did not finish rendering within ${Math.round(budgetMs / 1000)} s`,
					};
				}
				const message = error instanceof Error ? error.message : String(error);
				return {
					kind: "unavailable",
					reason: `Browser rendering failed: ${message.split("\n")[0]}`,
				};
			} finally {
				clearTimeout(timer);
				if (browser) await closeBrowser(browser as BrowserLike, closeTimeoutMs);
			}
		},
	};
}
