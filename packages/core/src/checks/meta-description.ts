import type { Check } from "../types.ts";

export const DESCRIPTION_MIN = 50;
export const DESCRIPTION_MAX = 300;

export const metaDescription: Check = {
	id: "meta-description",
	category: "content-semantics",
	title: "Meta description",
	weight: 10,
	async run(ctx) {
		let content = "";
		ctx.$("meta[name]").each((_, el) => {
			const name = ctx.$(el).attr("name")?.trim().toLowerCase();
			if (name !== "description" || content) return;
			content = (ctx.$(el).attr("content") ?? "").replace(/\s+/g, " ").trim();
		});
		if (!content) {
			return {
				status: "fail",
				message: "No meta description on the page",
				remediation:
					'Add <meta name="description" content="..."> inside <head>: one or two sentences on what the page is.',
			};
		}
		const length = [...content].length;
		if (length < DESCRIPTION_MIN || length > DESCRIPTION_MAX) {
			return {
				status: "warn",
				message: `The meta description is ${length} characters long (${DESCRIPTION_MIN}–${DESCRIPTION_MAX} reads well as a link caption)`,
				remediation: `Write a meta description of ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} characters that says what the page is.`,
			};
		}
		return {
			status: "pass",
			message: `Meta description present (${length} characters)`,
		};
	},
};
