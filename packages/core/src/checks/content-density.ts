import { type CheerioAPI, load } from "cheerio";
import type { Check } from "../types.ts";

const FAIL_WORDS = 50;
const WARN_WORDS = 150;
const WARN_RATIO = 0.5;

const WORD = /[\p{L}\p{N}]/u;

function countWords(text: string): number {
	return text.split(/\s+/).filter((token) => token !== "" && WORD.test(token))
		.length;
}

function textWords($: CheerioAPI, root: ReturnType<CheerioAPI>): number {
	// Nested roots (e.g. an article inside a main) must not count a node twice.
	const nodes = new Set(
		root
			.find("*")
			.addBack()
			.contents()
			.filter((_, node) => node.type === "text")
			.toArray(),
	);
	const texts = [...nodes].map((node) => $(node).text());
	return countWords(texts.join(" "));
}

export const contentDensity: Check = {
	id: "content-density",
	category: "content-semantics",
	title: "Content density",
	weight: 30,
	async run(ctx) {
		// Parse a private copy: ctx.$ is shared with checks running in parallel.
		const $ = load(ctx.page.body);
		$("script, style, noscript, template").remove();
		const bodyWords = textWords($, $("body"));

		const mainRoot = ["main", "article"]
			.map((sel) => $(sel))
			.find((els) => els.length > 0);
		const root = mainRoot ?? $("body");
		root.find("nav, header, footer, aside").remove();
		const mainWords = textWords($, root);

		const ratio = bodyWords === 0 ? 0 : mainWords / bodyWords;
		const percent = Math.round(ratio * 100);

		if (mainWords < FAIL_WORDS) {
			return {
				status: "fail",
				message: `Only ${mainWords} words of text in the raw HTML; content appears to be rendered by JavaScript, which most AI crawlers do not execute`,
				remediation:
					"Server-side render or pre-render the main content so it is present in the initial HTML.",
			};
		}
		const summary = `${mainWords} words of main content (${percent}% of page text)`;
		if (mainWords < WARN_WORDS) {
			return {
				status: "warn",
				message: summary,
				remediation:
					"Add substantive text content to the main part of the page.",
			};
		}
		if (ratio < WARN_RATIO) {
			return {
				status: "warn",
				message: summary,
				remediation:
					"Reduce boilerplate text or wrap the main content in <main>.",
			};
		}
		return { status: "pass", message: summary };
	},
};
