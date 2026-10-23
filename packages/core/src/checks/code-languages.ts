import type { Cheerio } from "cheerio";
import type { Check } from "../types.ts";

/** Class tokens that name a block's language (Prism, highlight.js, Docusaurus, GitHub). */
const LANGUAGE_CLASS = /^(language|lang|highlight-source)-[\w+#.-]+$/i;
const LANGUAGE_ATTRS = ["data-language", "data-lang"];

// biome-ignore lint/suspicious/noExplicitAny: any cheerio selection
function namesLanguage(node: Cheerio<any>): boolean {
	if (LANGUAGE_ATTRS.some((attr) => node.attr(attr)?.trim())) return true;
	return (node.attr("class") ?? "")
		.split(/\s+/)
		.some((token) => LANGUAGE_CLASS.test(token));
}

/**
 * Code blocks (`<pre>`) in the static HTML should say which language they are
 * in, on the block, its `<code>` or a wrapper up to two levels out, so an
 * agent tells a shell command from its output. Pages without code skip.
 */
export const codeLanguages: Check = {
	id: "code-languages",
	category: "content-semantics",
	title: "Code blocks name their language",
	weight: 10,
	async run(ctx) {
		const { $ } = ctx;
		const blocks = $("pre").toArray();
		if (blocks.length === 0) {
			return { status: "skip", message: "No code blocks on the page" };
		}
		const named = blocks.filter((pre) => {
			const block = $(pre);
			return [
				block,
				...block
					.children("code")
					.toArray()
					.map((el) => $(el)),
				...block
					.parents()
					.slice(0, 2)
					.toArray()
					.map((el) => $(el)),
			].some(namesLanguage);
		}).length;
		const summary = `${named} of ${blocks.length} code block${blocks.length === 1 ? "" : "s"} name their language`;
		if (named === blocks.length) {
			return { status: "pass", message: summary };
		}
		const remediation =
			'Mark each code block with its language, e.g. <pre><code class="language-bash">, or a ```bash fence in the markdown source.';
		return {
			status: named === 0 ? "fail" : "warn",
			message: summary,
			remediation,
		};
	},
};
