import type { Check } from "../types.ts";
import { wordCounts } from "./content-density.ts";

const PASS_SHARE = 0.8;
const WARN_SHARE = 0.5;
/** Below this many rendered words a share says little; content-density covers thin pages. */
const MIN_RENDERED = 50;

/**
 * Most AI crawlers do not run JavaScript: they read the static HTML. Compares
 * its main text with the same page rendered in the browser, counted by the
 * same rule (`wordCounts`). Needs a browser; skipped without one.
 */
export const staticContent: Check = {
	id: "static-content",
	category: "content-semantics",
	title: "Content without JavaScript",
	weight: 15,
	async run(ctx) {
		const outcome = await ctx.rendered();
		if (outcome.kind === "unavailable") {
			return { status: "skip", message: outcome.reason };
		}
		if (outcome.html === undefined) {
			return {
				status: "skip",
				message: "The rendered page could not be read",
			};
		}
		const rendered = wordCounts(outcome.html).main;
		const plain = wordCounts(ctx.page.body).main;
		if (rendered < MIN_RENDERED) {
			return {
				status: "pass",
				message: `The rendered page has little text (${rendered} words); nothing depends on JavaScript`,
			};
		}
		const share = Math.min(1, plain / rendered);
		const percent = Math.round(share * 100);
		const message = `The static HTML carries ${percent}% of the rendered text (${plain} of ${rendered} words)`;
		if (share >= PASS_SHARE) return { status: "pass", message };
		return {
			status: share >= WARN_SHARE ? "warn" : "fail",
			message,
			remediation:
				"Render the main content on the server (SSR or pre-rendering) so crawlers that do not run JavaScript get it in the HTML.",
		};
	},
};
