import type { Check } from "../types.ts";

const FAIL_RATIO = 0.1;
const MAX_DETAILS = 5;

export const accessibleNames: Check = {
	id: "accessible-names",
	category: "agentic-actionability",
	title: "Accessible names",
	weight: 40,
	async run(ctx) {
		const outcome = await ctx.rendered();
		if (outcome.kind === "unavailable") {
			return { status: "skip", message: outcome.reason };
		}
		const failed = outcome.failures?.accessibility;
		if (failed) {
			return {
				status: "skip",
				message: `Accessibility tree unavailable: ${failed}`,
			};
		}
		const total = outcome.interactive.length;
		if (total === 0) {
			return { status: "pass", message: "No interactive elements found" };
		}
		const unnamed = outcome.interactive.filter((n) => n.name.trim() === "");
		if (unnamed.length === 0) {
			return {
				status: "pass",
				message: `All ${total} interactive elements have accessible names`,
			};
		}
		const ratio = unnamed.length / total;
		const details = unnamed
			.slice(0, MAX_DETAILS)
			.map((n) => `${n.role}: ${n.element}`);
		if (unnamed.length > MAX_DETAILS) {
			details.push(`… and ${unnamed.length - MAX_DETAILS} more`);
		}
		return {
			status: ratio > FAIL_RATIO ? "fail" : "warn",
			message: `${unnamed.length} of ${total} interactive elements have no accessible name (${Math.round(ratio * 100)}%)`,
			details,
			remediation:
				"Give icon-only links and buttons an accessible name (aria-label or visually hidden text).",
		};
	},
};
