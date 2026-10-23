import type { CheerioAPI } from "cheerio";
import type { RenderOutcome } from "./browser/types.ts";
import type { HttpResult } from "./http.ts";

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
	/** Relative paths resolve against targetUrl.origin; a call with `accept` is not cached. */
	get(pathOrUrl: string, opts?: { accept?: string }): Promise<HttpResult>;
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
}
