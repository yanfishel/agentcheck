import type { Check } from "../types.ts";

const COVERAGE_LIMIT = 0.33;
const MAX_DETAILS = 5;

export const overlayBlocking: Check = {
	id: "overlay-blocking",
	category: "agentic-actionability",
	title: "Overlay blocking",
	weight: 20,
	async run(ctx) {
		const outcome = await ctx.rendered();
		if (outcome.kind === "unavailable") {
			return { status: "skip", message: outcome.reason };
		}
		const failed = outcome.failures?.dom;
		if (failed) {
			return {
				status: "skip",
				message: `Page measurements unavailable: ${failed}`,
			};
		}
		const blocking = outcome.overlays.filter(
			(o) => o.coversCentre || o.coverage > COVERAGE_LIMIT,
		);
		if (blocking.length === 0) {
			return { status: "pass", message: "Nothing covers the page on load" };
		}
		const details = blocking
			.slice(0, MAX_DETAILS)
			.map(
				(o) =>
					`${o.element} covers ${Math.round(o.coverage * 100)}% of the viewport`,
			);
		if (blocking.length > MAX_DETAILS) {
			details.push(`… and ${blocking.length - MAX_DETAILS} more`);
		}
		return {
			status: "fail",
			message: `${blocking.length} ${blocking.length === 1 ? "element covers" : "elements cover"} the page on load`,
			details,
			remediation:
				"Do not cover the page with fixed banners or popups on load; let agents dismiss or bypass them.",
		};
	},
};
