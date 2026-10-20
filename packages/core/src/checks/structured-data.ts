import type { Check } from "../types.ts";

const SCHEMA_ORG = /^https?:\/\/(www\.)?schema\.org(\/|$)/i;

/** True when any string at any depth of an @context value points at schema.org. */
function mentionsSchemaOrg(context: unknown): boolean {
	if (typeof context === "string") return SCHEMA_ORG.test(context.trim());
	if (Array.isArray(context)) return context.some(mentionsSchemaOrg);
	if (context && typeof context === "object") {
		return Object.values(context).some(mentionsSchemaOrg);
	}
	return false;
}

/** Walks parsed JSON-LD looking for a schema.org @context at any nesting level. */
export function hasSchemaOrgContext(node: unknown): boolean {
	if (Array.isArray(node)) return node.some(hasSchemaOrgContext);
	if (node && typeof node === "object") {
		return Object.entries(node).some(([key, value]) =>
			key === "@context"
				? mentionsSchemaOrg(value)
				: hasSchemaOrgContext(value),
		);
	}
	return false;
}

export const structuredData: Check = {
	id: "structured-data",
	category: "content-semantics",
	title: "Structured data",
	weight: 25,
	async run(ctx) {
		const blocks: string[] = [];
		ctx.$("script[type]").each((_, el) => {
			const type = ctx.$(el).attr("type")?.trim().toLowerCase();
			if (type === "application/ld+json") blocks.push(ctx.$(el).text());
		});

		let valid = false;
		let unparsable = 0;
		let noContext = 0;
		for (const raw of blocks) {
			try {
				if (hasSchemaOrgContext(JSON.parse(raw))) valid = true;
				else noContext++;
			} catch {
				unparsable++;
			}
		}
		if (valid) {
			return { status: "pass", message: "Valid schema.org JSON-LD found" };
		}

		if (blocks.length > 0) {
			const details: string[] = [];
			if (unparsable > 0)
				details.push(`${unparsable} block(s) failed to parse`);
			if (noContext > 0) {
				details.push(`${noContext} block(s) without a schema.org @context`);
			}
			return {
				status: "fail",
				message: "JSON-LD is present but not usable",
				details,
				remediation:
					'Fix the JSON syntax and set "@context": "https://schema.org" in each JSON-LD block.',
			};
		}

		if (ctx.$("[itemscope]").length > 0) {
			return {
				status: "warn",
				message: "Only microdata found, no JSON-LD",
				remediation:
					"Add a JSON-LD block with a schema.org @context; it is easier for agents to parse than microdata.",
			};
		}
		return {
			status: "fail",
			message: "No structured data found",
			remediation:
				'Add a <script type="application/ld+json"> block describing the page with schema.org types.',
		};
	},
};
