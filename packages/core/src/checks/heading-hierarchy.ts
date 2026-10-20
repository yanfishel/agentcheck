import type { Check } from "../types.ts";

const TEXT_LIMIT = 60;

export const headingHierarchy: Check = {
	id: "heading-hierarchy",
	category: "content-semantics",
	title: "Heading hierarchy",
	weight: 25,
	async run(ctx) {
		const headings = ctx
			.$("h1, h2, h3, h4, h5, h6")
			.toArray()
			.map((el) => ({
				level: Number(el.tagName.slice(1)),
				text: ctx.$(el).text().replace(/\s+/g, " ").trim(),
			}));
		const remediation =
			"Use exactly one h1 and nest headings without skipping levels (h2, then h3).";

		const h1Count = headings.filter((h) => h.level === 1).length;
		if (h1Count === 0) {
			const first = headings[0];
			return {
				status: "fail",
				message:
					headings.length === 0
						? "No headings found in the HTML"
						: "No h1 heading found",
				details: first ? [`first heading: h${first.level}`] : undefined,
				remediation,
			};
		}

		const details: string[] = [];
		if (h1Count > 1) details.push(`${h1Count} h1 headings`);
		// Headings before the first h1 (e.g. in a site header) are ignored.
		const fromH1 = headings.slice(headings.findIndex((h) => h.level === 1));
		for (const [i, cur] of fromH1.entries()) {
			const prev = fromH1[i - 1];
			if (prev && cur.level - prev.level > 1) {
				const text = cur.text.slice(0, TEXT_LIMIT);
				details.push(`h${prev.level} → h${cur.level} ("${text}")`);
			}
		}
		if (details.length === 0) {
			return { status: "pass", message: "Headings form a clean hierarchy" };
		}
		return {
			status: "warn",
			message: "Heading hierarchy has problems",
			details,
			remediation,
		};
	},
};
