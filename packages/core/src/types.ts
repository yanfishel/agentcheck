import type { CheerioAPI } from "cheerio";
import type { RenderOutcome } from "./browser/types.ts";
import type { HttpResult } from "./http.ts";
import type { ProtocolsResult } from "./protocols.ts";

export type CategoryId =
	| "ai-manifests"
	| "bot-access"
	| "content-semantics"
	| "agentic-actionability";

export type Status = "pass" | "warn" | "fail" | "skip";

export type Grade = "A+" | "A" | "B" | "C" | "D" | "F";

export type RobotsInfo =
	| {
			kind: "found";
			body: string;
			isAllowed(url: string, userAgent: string): boolean;
			/** Disallow values from the group that applies to the user agent. */
			disallowedPaths(userAgent: string): string[];
	  }
	| { kind: "missing" }
	| { kind: "error"; reason: string };

export interface AuditContext {
	/** Final URL after redirects. */
	targetUrl: URL;
	/** Target page response. */
	page: { body: string; headers: Headers };
	/** Parsed target page. */
	$: CheerioAPI;
	/** Relative paths resolve against targetUrl.origin; a call with `accept` or `signal` is not cached. */
	get(
		pathOrUrl: string,
		opts?: { accept?: string; signal?: AbortSignal },
	): Promise<HttpResult>;
	/** Memoized robots.txt lookup. */
	robots(): Promise<RobotsInfo>;
	/** Memoized browser render of targetUrl. */
	rendered(): Promise<RenderOutcome>;
	/** True once rendered() has been called. */
	renderStarted(): boolean;
}

export interface CheckOutcome {
	status: Status;
	message: string;
	details?: string[];
	remediation?: string;
}

export interface Check {
	id: string;
	category: CategoryId;
	/**
	 * "site": the answer is the same for every page of the site (llms.txt,
	 * sitemap, ...). A crawl runs it once, on the first page, and reuses the
	 * result for the other pages. Page checks leave it out.
	 */
	scope?: "site";
	title: string;
	weight: number;
	run(ctx: AuditContext): Promise<CheckOutcome>;
}

export interface CheckResult extends CheckOutcome {
	id: string;
	title: string;
	weight: number;
}

interface CategoryResultBase {
	id: CategoryId;
	title: string;
	weight: number;
	checks: CheckResult[];
}

export type CategoryResult =
	| (CategoryResultBase & { status: "scored"; score: number })
	| (CategoryResultBase & {
			status: "skipped";
			score: null;
			skipReason: string;
	  });

export interface AuditResult {
	tool: { name: "agentcheck"; version: string };
	target: string;
	finalUrl: string;
	timestamp: string;
	categories: CategoryResult[];
	score: number;
	grade: Grade;
	browser:
		| { used: false; reason: string }
		| {
				used: true;
				engine: "chrome" | "chromium";
				version: string;
				renderMs: number;
		  };
	/**
	 * Agent protocols the site publishes (MCP, A2A, OAuth, ...): informational,
	 * never scored. Absent in results stored before it existed.
	 */
	protocols?: ProtocolsResult;
	/** Present only for a crawl (`--crawl`): every page audited and the site's score. */
	crawl?: CrawlResult;
}

/** A page of a crawl: its score (site checks included) and its own problems. */
export type CrawledPage =
	| {
			url: string;
			status: "audited";
			score: number;
			grade: Grade;
			/** Page checks that warn or fail on this page (site checks are in the main report). */
			problems: {
				id: string;
				title: string;
				status: "warn" | "fail";
				message: string;
			}[];
	  }
	| { url: string; status: "failed"; error: string };

/** How many audited pages a page check warns or fails on. */
export interface CrawlIssue {
	id: string;
	title: string;
	fail: number;
	warn: number;
}

export interface CrawlResult {
	/** The mean score of the audited pages: the site's headline score. */
	score: number;
	grade: Grade;
	/** The audited page first, then the others in the order they were picked. */
	pages: CrawledPage[];
	/** Page checks with problems, most pages first. */
	issues: CrawlIssue[];
}
