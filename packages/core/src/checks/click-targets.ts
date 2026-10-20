import type { Check } from "../types.ts";

const FAIL_RATIO = 0.25;
const MAX_DETAILS = 5;

export const clickTargets: Check = {
	id: "click-targets",
	category: "agentic-actionability",
	title: "Click targets",
	weight: 25,
	async run(ctx) {
		const outcome = await ctx.rendered();
		if (outcome.kind === "unavailable") {
			return { status: "skip", message: outcome.reason };
		}
		const failed = outcome.failures?.accessibility ?? outcome.failures?.dom;
		if (failed) {
			return {
				status: "skip",
				message: `Page measurements unavailable: ${failed}`,
			};
		}
		const traps = outcome.clickTraps.length;
		if (traps === 0) {
			return { status: "pass", message: "No click traps found" };
		}
		const total = traps + outcome.interactive.length;
		const ratio = traps / total;
		const details = outcome.clickTraps
			.slice(0, MAX_DETAILS)
			.map((t) => t.element);
		if (traps > MAX_DETAILS) {
			details.push(`… and ${traps - MAX_DETAILS} more`);
		}
		return {
			status: ratio > FAIL_RATIO ? "fail" : "warn",
			message: `${traps} of ${total} click targets are not buttons or links (${Math.round(ratio * 100)}%)`,
			details,
			remediation:
				'Use <button> or role="button" with tabindex="0" for clickable elements, not plain <div>/<span>.',
		};
	},
};
