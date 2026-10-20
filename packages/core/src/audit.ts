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
import { type Favicon, fetchFavicon } from "./favicon.ts";
import { createFetcher, type Fetcher, type NetworkOptions } from "./http.ts";
import { CHECKS } from "./registry.ts";
import { buildCategoryResults, gradeFor, overallScore } from "./scoring.ts";
import type { AuditResult, CategoryId, Check, CheckResult } from "./types.ts";
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
	/** @internal tests only: time cap for the favicon fetch (default FAVICON_BUDGET_MS). */
	faviconBudgetMs?: number;
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
}

/**
 * The option pieces a service must use: network guard on, and a renderer that
 * is either guarded or disabled. Spread the result into the runAudit options.
 */
export function guardedAuditOptions(
	opts: GuardedAuditOptionsInput,
): Pick<
	AuditOptions,
	"network" | "renderer" | "userAgent" | "toolVersion" | "onFavicon"
> {
	return {
		userAgent: opts.userAgent,
		toolVersion: opts.toolVersion,
		network: { blockPrivate: true },
		...(opts.onFavicon && { onFavicon: opts.onFavicon }),
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
		? startFavicon(fetcher, ctx.$, ctx.targetUrl, opts.faviconBudgetMs)
		: null;

	const results = await Promise.all(
		checks.map(
			async (check): Promise<CheckResult & { category: CategoryId }> => {
				const base = {
					id: check.id,
					title: check.title,
					weight: check.weight,
					category: check.category,
				};
				try {
					return { ...base, ...(await check.run(ctx)) };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					return {
						...base,
						status: "fail",
						message: `Check crashed: ${message}`,
						remediation: "This is a bug in AgentCheck; please report it.",
					};
				}
			},
		),
	);

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

	if (favicon && opts.onFavicon) {
		const icon = await favicon();
		if (icon) {
			try {
				opts.onFavicon(icon);
			} catch {
				// A failing consumer never affects the audit.
			}
		}
	}

	const categories = buildCategoryResults(results);
	const score = overallScore(categories);
	return {
		tool: { name: "agentcheck", version: opts.toolVersion ?? VERSION },
		target,
		finalUrl: ctx.targetUrl.href,
		timestamp: (opts.now?.() ?? new Date()).toISOString(),
		categories,
		score,
		grade: gradeFor(score),
		browser,
	};
}

/**
 * Starts the favicon fetch now and returns a getter that settles within the
 * budget (counted from the start). At the budget the icon requests are aborted
 * so nothing is left in flight when the fetcher closes; the fetch never rejects.
 */
function startFavicon(
	fetcher: Fetcher,
	$: CheerioAPI,
	pageUrl: URL,
	budgetMs = FAVICON_BUDGET_MS,
): () => Promise<Favicon | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), budgetMs);
	const pending = fetchFavicon(fetcher, $, pageUrl, {
		signal: controller.signal,
	})
		.catch(() => null)
		.finally(() => clearTimeout(timer));
	return () => pending;
}
