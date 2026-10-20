import { load } from "cheerio";
import robotsParserModule from "robots-parser";
import {
	type BrowserRenderer,
	disabledRenderer,
	NOT_ENABLED_REASON,
	type RenderOutcome,
} from "./browser/types.ts";
import type { Fetcher, HttpResult } from "./http.ts";
import type { AuditContext, RobotsInfo } from "./types.ts";

export class TargetUnreachableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TargetUnreachableError";
	}
}

// robots-parser ships CJS typings that TypeScript resolves as the module namespace under NodeNext.
type RobotsParser = typeof import("robots-parser").default;
const robotsParser = robotsParserModule as unknown as RobotsParser;

function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

interface Group {
	agents: string[];
	disallow: string[];
}

/** Disallow values of the group matching the agent (most specific token, else `*`). */
function disallowedPathsFor(body: string, userAgent: string): string[] {
	const agent = userAgent.toLowerCase();
	const groups: Group[] = [];
	let current: Group | null = null;
	let collectingAgents = false;
	for (const raw of body.split(/\r\n|\r|\n/)) {
		const line = raw.replace(/#.*$/, "").trim();
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		const field = line.slice(0, colon).trim().toLowerCase();
		const value = line.slice(colon + 1).trim();
		if (field === "user-agent") {
			if (!current || !collectingAgents) {
				current = { agents: [], disallow: [] };
				groups.push(current);
			}
			current.agents.push(value.toLowerCase());
			collectingAgents = true;
		} else if (current) {
			collectingAgents = false;
			if (field === "disallow" && value !== "") current.disallow.push(value);
		}
	}
	let bestLength = 0;
	for (const group of groups) {
		for (const token of group.agents) {
			if (token !== "*" && agent.includes(token)) {
				bestLength = Math.max(bestLength, token.length);
			}
		}
	}
	const matches = (token: string) =>
		bestLength > 0
			? token !== "*" && token.length === bestLength && agent.includes(token)
			: token === "*";
	return groups
		.filter((g) => g.agents.some(matches))
		.flatMap((g) => g.disallow);
}

function parseRobots(res: HttpResult): RobotsInfo {
	if (res.kind === "error") return { kind: "error", reason: res.error };
	if (res.status === 200) {
		const body = stripBom(res.body);
		const parser = robotsParser(res.url, body);
		return {
			kind: "found",
			body,
			isAllowed: (url, userAgent) => parser.isAllowed(url, userAgent) ?? true,
			disallowedPaths: (userAgent) => disallowedPathsFor(body, userAgent),
		};
	}
	if (res.status >= 500) {
		return { kind: "error", reason: `robots.txt returned HTTP ${res.status}` };
	}
	return { kind: "missing" };
}

export async function createAuditContext(
	target: string,
	fetcher: Fetcher,
	renderer: BrowserRenderer = disabledRenderer(NOT_ENABLED_REASON),
	browserUserAgent?: string,
): Promise<AuditContext> {
	let targetUrl: URL;
	try {
		targetUrl = new URL(target);
	} catch {
		throw new TargetUnreachableError(`Invalid URL: ${target}`);
	}
	const res = await fetcher.get(targetUrl);
	if (res.kind === "error") {
		throw new TargetUnreachableError(`Could not reach ${target}: ${res.error}`);
	}
	if (res.status < 200 || res.status >= 300) {
		throw new TargetUnreachableError(
			`Could not reach ${target}: HTTP ${res.status}`,
		);
	}
	const finalUrl = new URL(res.url);
	let robotsPromise: Promise<RobotsInfo> | undefined;
	let renderPromise: Promise<RenderOutcome> | undefined;

	const get = (pathOrUrl: string) =>
		fetcher.get(new URL(pathOrUrl, finalUrl.origin));

	return {
		targetUrl: finalUrl,
		page: { body: res.body, headers: res.headers },
		$: load(res.body),
		get,
		robots() {
			robotsPromise ??= get("/robots.txt").then(parseRobots);
			return robotsPromise;
		},
		rendered() {
			renderPromise ??= Promise.resolve()
				.then(() =>
					renderer.render(finalUrl.href, { userAgent: browserUserAgent }),
				)
				.catch(
					(err): RenderOutcome => ({
						kind: "unavailable",
						reason: `Browser rendering failed: ${err instanceof Error ? err.message : String(err)}`,
					}),
				);
			return renderPromise;
		},
		renderStarted: () => renderPromise !== undefined,
	};
}
