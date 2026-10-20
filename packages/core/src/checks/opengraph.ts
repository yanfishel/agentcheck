import type { Check } from "../types.ts";

const REQUIRED = ["og:title", "og:description", "og:image", "og:url"];

export const opengraph: Check = {
	id: "opengraph",
	category: "content-semantics",
	title: "OpenGraph tags",
	weight: 20,
	async run(ctx) {
		const present = new Set<string>();
		ctx.$("meta").each((_, el) => {
			const key = (ctx.$(el).attr("property") ?? ctx.$(el).attr("name"))
				?.trim()
				.toLowerCase();
			if (key && ctx.$(el).attr("content")?.trim()) present.add(key);
		});

		const missing = REQUIRED.filter((tag) => !present.has(tag));
		if (missing.length === 0) {
			return { status: "pass", message: "All core OpenGraph tags present" };
		}
		const remediation = `Add ${missing.map((m) => `<meta property="${m}" content="...">`).join(", ")} to the page head.`;
		if (missing.length === REQUIRED.length) {
			return {
				status: "fail",
				message: "No OpenGraph tags found",
				details: missing,
				remediation,
			};
		}
		return {
			status: "warn",
			message: `Missing OpenGraph tags: ${missing.join(", ")}`,
			details: missing,
			remediation,
		};
	},
};
