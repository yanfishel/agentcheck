import type { Check } from "../types.ts";

const FAIL_DIRECTIVES = ["noai"];
const WARN_DIRECTIVES = ["noimageai"];

/** Splits a directive list; a leading "botname:" prefix is dropped. */
function parseDirectives(value: string): string[] {
	return value
		.split(",")
		.map((token) => {
			const colon = token.indexOf(":");
			return (colon === -1 ? token : token.slice(colon + 1))
				.trim()
				.toLowerCase();
		})
		.filter(Boolean);
}

export const noaiDirectives: Check = {
	id: "noai-directives",
	category: "bot-access",
	title: "No noai directives",
	weight: 30,
	async run(ctx) {
		const found = new Set<string>();
		ctx.$("meta[name]").each((_, el) => {
			const name = ctx.$(el).attr("name")?.trim().toLowerCase();
			if (name !== "robots") return;
			for (const d of parseDirectives(ctx.$(el).attr("content") ?? "")) {
				found.add(d);
			}
		});
		for (const d of parseDirectives(
			ctx.page.headers.get("x-robots-tag") ?? "",
		)) {
			found.add(d);
		}

		const failing = FAIL_DIRECTIVES.filter((d) => found.has(d));
		const warning = WARN_DIRECTIVES.filter((d) => found.has(d));
		if (failing.length === 0 && warning.length === 0) {
			return {
				status: "pass",
				message: "No noai or noimageai directives found",
			};
		}
		const details = [...failing, ...warning];
		const remediation =
			"Remove noai/noimageai from the robots meta tag and X-Robots-Tag header if AI use of your content is acceptable.";
		if (failing.length > 0) {
			return {
				status: "fail",
				message: `Page opts out of AI use via ${details.join(", ")}`,
				details,
				remediation,
			};
		}
		return {
			status: "warn",
			message: `Page opts out of AI image use via ${details.join(", ")}`,
			details,
			remediation,
		};
	},
};
