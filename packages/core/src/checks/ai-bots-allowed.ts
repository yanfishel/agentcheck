import type { Check } from "../types.ts";

export const AI_BOTS = [
	"GPTBot",
	"ClaudeBot",
	"PerplexityBot",
	"Applebot-Extended",
	"Google-Extended",
] as const;

export const aiBotsAllowed: Check = {
	id: "ai-bots-allowed",
	category: "bot-access",
	title: "AI crawlers allowed",
	weight: 60,
	async run(ctx) {
		const robots = await ctx.robots();
		if (robots.kind === "missing") {
			return {
				status: "pass",
				message: "No robots.txt found; all AI crawlers are allowed by default",
			};
		}
		if (robots.kind === "error") {
			return {
				status: "warn",
				message: `robots.txt unavailable, could not determine AI crawler access (${robots.reason})`,
				remediation:
					"Make /robots.txt reachable and return HTTP 200 (or 404 to allow everything).",
			};
		}
		const href = ctx.targetUrl.href;
		const blocked = AI_BOTS.filter((bot) => !robots.isAllowed(href, bot));
		if (blocked.length === 0) {
			return {
				status: "pass",
				message: `robots.txt allows ${AI_BOTS.join(", ")}`,
			};
		}
		const remediation = `In robots.txt, remove the Disallow rules from the User-agent groups for ${blocked.join(", ")} (or from User-agent: * if they fall back to it) for the audited path.`;
		if (blocked.length === AI_BOTS.length) {
			return {
				status: "fail",
				message: "robots.txt blocks all major AI crawlers",
				details: [...blocked],
				remediation,
			};
		}
		return {
			status: "warn",
			message: `robots.txt blocks ${blocked.length} of ${AI_BOTS.length} major AI crawlers`,
			details: [...blocked],
			remediation,
		};
	},
};
