import type { AuditContext, Check } from "../types.ts";
import { AI_BOTS } from "./ai-bots-allowed.ts";

/** Directives whose own syntax has a colon: `max-snippet:20` is not a user agent. */
const VALUE_DIRECTIVES = new Set([
	"max-snippet",
	"max-image-preview",
	"max-video-preview",
	"unavailable_after",
]);

/** Robots meta names and X-Robots-Tag agents that speak to AI crawlers. */
const AGENTS = new Set(["robots", ...AI_BOTS.map((bot) => bot.toLowerCase())]);

const FAIL = new Set(["noindex", "none", "nosnippet"]);

interface Directive {
	/** "noindex", "max-snippet:50" (lowercased, spaces removed). */
	token: string;
	/** "robots meta" / "X-Robots-Tag" / "GPTBot meta"... */
	source: string;
}

/** Splits one robots list; directives with a value keep it (`max-snippet:50`). */
function tokens(list: string): string[] {
	return list
		.split(",")
		.map((t) =>
			t
				.trim()
				.toLowerCase()
				.replace(/\s*:\s*/, ":"),
		)
		.filter(Boolean);
}

/**
 * X-Robots-Tag tokens with the agent each applies to. Headers joins several
 * X-Robots-Tag lines with ", ", so `noindex, googlebot: nofollow` arrives as
 * one list: an `<agent>:` prefix scopes its token and the ones after it.
 */
function headerDirectives(value: string): { agent: string; token: string }[] {
	const out: { agent: string; token: string }[] = [];
	let agent = "robots";
	for (const raw of value.split(",")) {
		let token = raw.trim();
		const match = /^([^\s:]+)\s*:\s*(.*)$/.exec(token);
		const name = match?.[1]?.toLowerCase();
		if (match && name && !VALUE_DIRECTIVES.has(name)) {
			agent = name;
			token = match[2] ?? "";
		}
		for (const t of tokens(token)) out.push({ agent, token: t });
	}
	return out;
}

export function pageDirectives(ctx: AuditContext): Directive[] {
	const found: Directive[] = [];
	ctx.$("meta[name][content]").each((_, el) => {
		const name = ctx.$(el).attr("name")?.trim().toLowerCase() ?? "";
		if (!AGENTS.has(name)) return;
		const source = name === "robots" ? "robots meta" : `${name} meta`;
		for (const token of tokens(ctx.$(el).attr("content") ?? "")) {
			found.push({ token, source });
		}
	});
	// Headers is a comma-joined list; each X-Robots-Tag line was one value.
	const header = ctx.page.headers.get("x-robots-tag");
	if (header) {
		for (const { agent, token } of headerDirectives(header)) {
			if (!AGENTS.has(agent)) continue;
			const source =
				agent === "robots" ? "X-Robots-Tag" : `X-Robots-Tag (${agent})`;
			found.push({ token, source });
		}
	}
	return found;
}

function limits(token: string): boolean {
	const [name, value = ""] = token.split(":");
	if (name === "max-snippet") return value.trim() !== "-1";
	if (name === "max-image-preview") return value.trim() === "none";
	return false;
}

export const snippetDirectives: Check = {
	id: "snippet-directives",
	category: "bot-access",
	title: "Page may be shown and quoted",
	weight: 15,
	async run(ctx) {
		const directives = pageDirectives(ctx);
		const describe = (list: Directive[]) =>
			list.map((d) => `${d.source}: ${d.token}`);
		const failing = directives.filter((d) => FAIL.has(d.token));
		if (failing.length > 0) {
			return {
				status: "fail",
				message: `The page forbids search and AI answers to show it (${[...new Set(failing.map((d) => d.token))].join(", ")})`,
				details: describe(failing),
				remediation:
					"Remove noindex, none and nosnippet from the robots meta tag and the X-Robots-Tag header if search and AI answers may show this page.",
			};
		}
		const limited = directives.filter((d) => limits(d.token));
		const hidden = ctx.$("body [data-nosnippet]").length;
		if (limited.length > 0 || hidden > 0) {
			const details = describe(limited);
			if (hidden > 0) {
				details.push(
					`${hidden} element${hidden === 1 ? "" : "s"} with data-nosnippet`,
				);
			}
			return {
				status: "warn",
				message: "The page limits what search and AI answers may quote",
				details,
				remediation:
					"Drop max-snippet limits, max-image-preview:none and data-nosnippet unless that text must stay out of answers.",
			};
		}
		return {
			status: "pass",
			message: "No robots directive keeps the page out of answers",
		};
	},
};
