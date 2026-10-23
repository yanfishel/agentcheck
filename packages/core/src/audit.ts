import type { CheerioAPI } from "cheerio";
import type { Dispatcher } from "undici";
import {
	createGuardedBrowserRenderer,
	type GuardedBrowserRendererOptions,
} from "./browser/guarded.ts";
import {
	type BrowserRenderer,
	disabledRenderer,
	NOT_ENABLED_REASON,
	type Screenshot,
} from "./browser/types.ts";
import { createAuditContext } from "./context.ts";
import { crawlSite } from "./crawl.ts";
import { type Favicon, fetchFavicon } from "./favicon.ts";
import { createFetcher, type Fetcher, type NetworkOptions } from "./http.ts";
import type { FinishedCheck } from "./progress.ts";
import { findProtocols } from "./protocols.ts";
import { CHECKS } from "./registry.ts";
import { runChecks } from "./run-checks.ts";
import { buildCategoryResults, gradeFor, overallScore } from "./scoring.ts";
import type { AuditResult, Check } from "./types.ts";
import { VERSION } from "./version.ts";

export interface AuditOptions {
	userAgent: string;
	dispatcher?: Dispatcher;
	checks?: Check[];
	now?: () => Date;
	renderer?: BrowserRenderer;
	browserUserAgent?: string;
	/** Version of the running tool reported in the result; defaults to the core package version. */
	toolVersion?: string;
	/** Opt-in network guard: refuse private/loopback targets. */
	network?: NetworkOptions;
	/** Opt-in: receives the site's favicon when one is found. Never affects the result. */
	onFavicon?: (icon: Favicon) => void;
	/** Opt-in: called once per check as it settles (a crashed check too). Never affects the result. */
	onCheck?: (check: FinishedCheck) => void;
	/** @internal tests only: time cap for the favicon fetch (default FAVICON_BUDGET_MS). */
	faviconBudgetMs?: number;
	/**
	 * Opt-in: audit up to `limit` pages of the site (the target included) and
	 * add `crawl` to the result. Other pages run without the browser.
	 */
	crawl?: { limit: number };
}

/** Longest the favicon fetch may run after the checks are done. */
export const FAVICON_BUDGET_MS = 5_000;

export interface GuardedAuditOptionsInput {
	userAgent: string;
	toolVersion?: string;
	/** true: guarded browser renderer; false: no browser at all. */
	browser: boolean;
	/** Pass-through options for the guarded renderer (budget, settle time, ...). */
	rendererOptions?: Omit<GuardedBrowserRendererOptions, "toolVersion">;
	/** Opt-in: receives a first-screen screenshot of a successfully rendered page. */
	onScreenshot?: (shot: Screenshot) => void;
	/** Opt-in: receives the site's favicon when one is found. */
	onFavicon?: (icon: Favicon) => void;
	/** Opt-in: called once per check as it settles. */
	onCheck?: (check: FinishedCheck) => void;
}

/**
 * The option pieces a service must use: network guard on, and a renderer that
 * is either guarded or disabled. Spread the result into the runAudit options.
 */
export function guardedAuditOptions(
	opts: GuardedAuditOptionsInput,
): Pick<
	AuditOptions,
	"network" | "renderer" | "userAgent" | "toolVersion" | "onFavicon" | "onCheck"
> {
	return {
		userAgent: opts.userAgent,
		toolVersion: opts.toolVersion,
		network: { blockPrivate: true },
		...(opts.onFavicon && { onFavicon: opts.onFavicon }),
		...(opts.onCheck && { onCheck: opts.onCheck }),
		renderer: opts.browser
			? createGuardedBrowserRenderer({
					...opts.rendererOptions,
					...(opts.onScreenshot && { onScreenshot: opts.onScreenshot }),
					toolVersion: opts.toolVersion,
				})
			: disabledRenderer(NOT_ENABLED_REASON),
	};
}

export async function runAudit(
	target: string,
	opts: AuditOptions,
): Promise<AuditResult> {
	const renderer = opts.renderer ?? disabledRenderer(NOT_ENABLED_REASON);
	if (opts.network?.blockPrivate && !renderer.disabled && !renderer.guarded) {
		throw new Error(
			"network.blockPrivate requires createGuardedBrowserRenderer() or no browser",
		);
	}
	const fetcher = createFetcher({
		userAgent: opts.userAgent,
		dispatcher: opts.dispatcher,
		network: opts.network,
	});
	try {
		return await execute(target, opts, fetcher, renderer);
	} finally {
		await fetcher.close();
	}
}

async function execute(
	target: string,
	opts: AuditOptions,
	fetcher: Fetcher,
	renderer: BrowserRenderer,
): Promise<AuditResult> {
	const ctx = await createAuditContext(
		target,
		fetcher,
		renderer,
		opts.browserUserAgent,
	);
	const checks = opts.checks ?? CHECKS;
	const favicon = opts.onFavicon
		? startFavicon(
				fetcher,
				ctx.$,
				ctx.targetUrl,
				opts.onFavicon,
				opts.faviconBudgetMs,
			)
		: null;
	// Alongside the checks; it never throws and stays within its own budget.
	const protocols = findProtocols(ctx);

	const results = await runChecks(ctx, checks, opts.onCheck);

	let browser: AuditResult["browser"] = {
		used: false,
		reason: "No browser checks were run",
	};
	if (ctx.renderStarted()) {
		const outcome = await ctx.rendered();
		browser =
			outcome.kind === "rendered"
				? {
						used: true,
						engine: outcome.engine,
						version: outcome.version,
						renderMs: outcome.renderMs,
					}
				: { used: false, reason: outcome.reason };
	}

	// Delivered to onFavicon as soon as it is fetched; awaited here so nothing
	// is in flight when the fetcher closes.
	await favicon?.();

	const categories = buildCategoryResults(results);
	const score = overallScore(categories);
	const crawl = opts.crawl
		? await crawlSite(ctx, {
				fetcher,
				checks,
				first: { url: ctx.targetUrl.href, score, results },
				limit: opts.crawl.limit,
			})
		: undefined;
	return {
		tool: { name: "agentcheck", version: opts.toolVersion ?? VERSION },
		target,
		finalUrl: ctx.targetUrl.href,
		timestamp: (opts.now?.() ?? new Date()).toISOString(),
		categories,
		score,
		grade: gradeFor(score),
		browser,
		protocols: await protocols,
		...(crawl ? { crawl } : {}),
	};
}

/**
 * Starts the favicon fetch now and hands the icon to `onIcon` the moment it is
 * fetched. The returned promise settles within the budget (counted from the
 * start): at the budget the icon requests are aborted so nothing is left in
 * flight when the fetcher closes; it never rejects.
 */
function startFavicon(
	fetcher: Fetcher,
	$: CheerioAPI,
	pageUrl: URL,
	onIcon: (icon: Favicon) => void,
	budgetMs = FAVICON_BUDGET_MS,
): () => Promise<void> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), budgetMs);
	const pending = fetchFavicon(fetcher, $, pageUrl, {
		signal: controller.signal,
	})
		.catch(() => null)
		.then((icon) => {
			if (!icon) return;
			try {
				onIcon(icon);
			} catch {
				// A failing consumer never affects the audit.
			}
		})
		.finally(() => clearTimeout(timer));
	return () => pending;
}
