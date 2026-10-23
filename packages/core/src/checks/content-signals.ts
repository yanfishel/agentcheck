import type { Check } from "../types.ts";

/** The usage categories of the Content Signals draft (contentsignals.org). */
export const SIGNAL_KEYS = ["search", "ai-input", "ai-train"] as const;
type SignalKey = (typeof SIGNAL_KEYS)[number];

/** What AgentCheck's robots.txt generator declares when a site has no signals. */
export const DEFAULT_CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=no";

/** A signal an agent needs: saying "no" to it keeps agents from using the page. */
const AGENT_KEYS: readonly SignalKey[] = ["search", "ai-input"];

export interface ContentSignalLine {
	/** "robots.txt (User-agent: *)" or "Content-Signal header". */
	source: string;
	/** The raw value after `Content-Signal:`. */
	value: string;
	signals: Partial<Record<SignalKey, "yes" | "no">>;
}

/** Parses `search=yes, ai-input=no`; unknown keys and values are ignored. */
export function parseSignalValue(
	value: string,
): Partial<Record<SignalKey, "yes" | "no">> {
	const signals: Partial<Record<SignalKey, "yes" | "no">> = {};
	for (const pair of value.split(",")) {
		const eq = pair.indexOf("=");
		if (eq < 0) continue;
		const key = pair.slice(0, eq).trim().toLowerCase();
		const val = pair
			.slice(eq + 1)
			.trim()
			.toLowerCase();
		if (
			(SIGNAL_KEYS as readonly string[]).includes(key) &&
			(val === "yes" || val === "no")
		) {
			signals[key as SignalKey] = val;
		}
	}
	return signals;
}

/**
 * Every `Content-Signal` line of a robots.txt, whatever group it sits in:
 * sites append it at the end of the file, where it lands under the last bot's
 * group, and readers treat it as site-wide.
 */
export function robotsContentSignals(body: string): ContentSignalLine[] {
	const found: ContentSignalLine[] = [];
	let agents: string[] = [];
	let inAgents = false;
	for (const raw of body.split(/\r\n|\r|\n/)) {
		const line = raw.replace(/#.*$/, "");
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		const field = line.slice(0, colon).trim().toLowerCase();
		const value = line.slice(colon + 1).trim();
		if (field === "user-agent") {
			if (!inAgents) agents = [];
			if (value) agents.push(value);
			inAgents = true;
			continue;
		}
		inAgents = false;
		if (field !== "content-signal") continue;
		found.push({
			source:
				agents.length === 0
					? "robots.txt"
					: `robots.txt (User-agent: ${agents.join(", ")})`,
			value,
			signals: parseSignalValue(value),
		});
	}
	return found;
}

function describeLine(line: ContentSignalLine): string {
	return `${line.source}: ${line.value}`;
}

export const contentSignals: Check = {
	id: "content-signals",
	category: "bot-access",
	scope: "site",
	title: "Content signals declared",
	weight: 20,
	async run(ctx) {
		const lines: ContentSignalLine[] = [];
		const header = ctx.page.headers.get("content-signal");
		if (header?.trim()) {
			lines.push({
				source: "Content-Signal header",
				value: header.trim(),
				signals: parseSignalValue(header),
			});
		}
		const robots = await ctx.robots();
		if (robots.kind === "found")
			lines.push(...robotsContentSignals(robots.body));

		const remediation = `Add "Content-Signal: ${DEFAULT_CONTENT_SIGNAL}" to the User-agent: * group of robots.txt (see contentsignals.org).`;
		if (lines.length === 0) {
			if (robots.kind === "error") {
				return {
					status: "warn",
					message: `robots.txt unavailable, could not read the content signals (${robots.reason})`,
					remediation:
						"Make /robots.txt reachable and declare Content-Signal in it, or send a Content-Signal header with the page.",
				};
			}
			return {
				status: "fail",
				message: "No Content-Signal found in robots.txt or the page's headers",
				remediation,
			};
		}

		const valid = lines.filter((l) => Object.keys(l.signals).length > 0);
		const details = lines.map(describeLine);
		if (valid.length === 0) {
			return {
				status: "warn",
				message: "Content-Signal found, but it names no known signal",
				details,
				remediation: `Write the signals as key=value pairs: "Content-Signal: ${DEFAULT_CONTENT_SIGNAL}".`,
			};
		}
		const refused = AGENT_KEYS.filter((key) =>
			valid.some((l) => l.signals[key] === "no"),
		);
		if (refused.length > 0) {
			return {
				status: "warn",
				message: `Content signals opt out of ${refused.join(" and ")}`,
				details,
				remediation: `Set ${refused.map((k) => `${k}=yes`).join(", ")} in Content-Signal if agents may use your pages in search and AI answers.`,
			};
		}
		return {
			status: "pass",
			message: "Content signals let AI agents use the page",
			details,
		};
	},
};
