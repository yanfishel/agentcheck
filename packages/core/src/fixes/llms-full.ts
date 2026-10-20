import type { PageMeta } from "./extract.ts";
import { pageTitle, pathOf, safeUrl } from "./llms.ts";
import { shiftHeadings } from "./markdown.ts";
import { cleanText, escapeMarkdown } from "./text.ts";
import type { FixFile, FixTodo } from "./types.ts";

/** A page read for the fix files: its metadata and its main content as markdown ("" when none). */
export interface PageText {
	meta: PageMeta;
	markdown: string;
}

/** Upper bound for the whole llms-full.txt, in UTF-8 bytes. */
export const LLMS_FULL_MAX = 1024 * 1024;

/** Room kept for the closing "pages left out" line. */
const NOTE_RESERVE = 200;

const bytes = (text: string) => Buffer.byteLength(text, "utf8");

/** The section body: the page's markdown under its `##` heading, or a TODO. */
function sectionBody(markdown: string, url: URL, todos: FixTodo[]): string {
	if (markdown.trim() !== "") return shiftHeadings(markdown, 2);
	const path = pathOf(url);
	todos.push({ text: `llms-full.txt: add the text of ${path}` });
	return `<!-- TODO: add the text of ${path} -->`;
}

/**
 * llms-full.txt: the site's name and description, then the homepage and each
 * page in the order given (the generator passes llms.txt's order), every page
 * once, as `## <title>`, `Source: <url>` and its markdown. Pages that would
 * push the file over 1 MB are left out and counted in a TODO.
 */
export function buildLlmsFullTxt(home: PageText, pages: PageText[]): FixFile {
	const todos: FixTodo[] = [];
	const homeUrl = new URL(home.meta.url);
	const siteName = home.meta.siteName || homeUrl.hostname;

	const description = home.meta.description || home.meta.ogDescription;
	let summary: string;
	if (description) {
		summary = escapeMarkdown(cleanText(description, 300));
	} else {
		summary = "<!-- TODO: add a description of the site -->";
		todos.push({ text: "llms-full.txt: add a description of the site" });
	}
	let content = `# ${escapeMarkdown(siteName)}\n\n> ${summary}\n`;
	let size = bytes(content);

	const seen = new Set<string>();
	let leftOut = 0;
	for (const page of [home, ...pages]) {
		const url = safeUrl(page.meta.url, homeUrl.host);
		if (!url || seen.has(url.href)) continue;
		seen.add(url.href);
		const title = escapeMarkdown(
			pageTitle(page.meta, home.meta, siteName, url),
		);
		const sectionTodos: FixTodo[] = [];
		const body = sectionBody(page.markdown, url, sectionTodos);
		const section = `\n## ${title}\n\nSource: ${url.href}\n\n${body}\n`;
		const add = bytes(section);
		if (size + add > LLMS_FULL_MAX - NOTE_RESERVE) {
			leftOut++;
			continue;
		}
		content += section;
		size += add;
		todos.push(...sectionTodos);
	}

	if (leftOut > 0) {
		const note = `${leftOut} ${leftOut === 1 ? "page" : "pages"} left out to stay under 1 MB`;
		content += `\n<!-- AgentCheck: ${note} -->\n`;
		todos.push({ text: `llms-full.txt: ${note}` });
	}

	return {
		kind: "llms-full",
		name: "llms-full.txt",
		target: "New file at /llms-full.txt",
		fixes: ["llms-full-txt"],
		content,
		todos,
	};
}
