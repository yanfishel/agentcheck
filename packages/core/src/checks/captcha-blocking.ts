import type { Check } from "../types.ts";

const WARN_REMEDIATION =
	"Make sure agents can submit forms without solving a captcha, or offer an alternative contact path.";

const REMEDIATION =
	"Do not challenge ordinary page views with a captcha; protect forms or rate-limit instead.";

export const captchaBlocking: Check = {
	id: "captcha-blocking",
	category: "agentic-actionability",
	title: "Captcha blocking",
	weight: 15,
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
		const { markers, blocking, reason } = outcome.captcha;
		if (blocking) {
			return {
				status: "fail",
				message: reason
					? `Captcha blocks the page: ${reason}`
					: "Captcha blocks the page",
				remediation: REMEDIATION,
			};
		}
		if (markers.length > 0) {
			return {
				status: "warn",
				message: `Captcha present but not blocking the page (${markers.join(", ")})`,
				remediation: WARN_REMEDIATION,
			};
		}
		return { status: "pass", message: "No captcha found" };
	},
};
