import { load } from "cheerio";
import { pageMeta } from "./extract.ts";
import { pathOf } from "./llms.ts";
import type { PageText } from "./llms-full.ts";
import { hasHeading, pageMarkdown, shiftHeadings } from "./markdown.ts";
import { cleanText, escapeMarkdown } from "./text.ts";
import type { FixFile, FixTodo } from "./types.ts";

/** Longest file name stem kept for a twin. */
const NAME_MAX = 80;
/** Stems taken by the pack's own files; compared after lower-casing. */
const RESERVED = new Set([
	"readme",
	"agent-prompt",
	// Windows device names: a file called con.md cannot be created there.
	"con",
	"prn",
	"aux",
	"nul",
	...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
	...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

/**
 * The URL path the markdown-twin check probes by convention: the page path
 * without trailing slashes plus `.md`, `/index.md` for the root. The query is
 * ignored; the path stays percent-encoded as the URL has it.
 */
export function twinPath(url: URL): string {
	const path = url.pathname.replace(/\/+$/, "");
	return `${path === "" ? "/index" : path}.md`;
}

function decodeSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

/**
 * The twin's file name: the last path segment plus `.md` ("index.md" for the
 * root), lower-cased, accents dropped, and only `[a-z0-9._-]` kept (others
 * become "-"), so it always matches `^[a-z0-9][a-z0-9._-]*\.md$`. A stem
 * equal to "readme", "agent-prompt" or a Windows device name (con, nul, com1, ...; also before a dot) becomes `<stem>-page.md`, so it never
 * collides with the pack's README.md / AGENT-PROMPT.md, even case-insensitively.
 */
export function twinName(url: URL): string {
	const segment = url.pathname.split("/").filter(Boolean).at(-1);
	if (segment === undefined) return "index.md";
	const stem = decodeSegment(segment)
		.normalize("NFKD")
		.replace(/\p{M}+/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.slice(0, NAME_MAX)
		.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
	// The pack ships README.md and AGENT-PROMPT.md next to the files.
	if (RESERVED.has(stem.split(".")[0] ?? stem)) return `${stem}-page.md`;
	return `${stem || "page"}.md`;
}

/**
 * Drops the page's first line when it is a heading with the same text as the
 * title; `level` is the dropped heading's level, 0 when nothing was dropped.
 */
function dropTitleHeading(
	markdown: string,
	title: string,
): { markdown: string; level: number } {
	const [first = "", ...rest] = markdown.split("\n");
	const heading = /^(#{1,6}) +(.*)$/.exec(first);
	const text = heading?.[2]?.trim();
	if (text === undefined || text.toLowerCase() !== title.toLowerCase()) {
		return { markdown, level: 0 };
	}
	const level = heading?.[1]?.length ?? 0;
	return { markdown: rest.join("\n").replace(/^\n+/, ""), level };
}

/**
 * The markdown version of the audited page: `# <title>` (its og:title or
 * <title> as is: the site name guessed from a title is not reliable without
 * the homepage, so nothing is stripped), then its main content
 * with headings shifted one level down (the title is the only h1) and its
 * leading heading dropped when it repeats the title (no shift when that was
 * the page's only h1), or a TODO when the page
 * has none.
 */
export function buildMarkdownTwin(page: PageText): FixFile {
	const url = new URL(page.meta.url);
	const name = twinName(url);
	const path = twinPath(url);
	const plainTitle =
		cleanText(page.meta.ogTitle || page.meta.title) ||
		page.meta.h1 ||
		pathOf(url);
	const title = escapeMarkdown(plainTitle);
	const todos: FixTodo[] = [];
	const { markdown, level } = dropTitleHeading(page.markdown, title);
	// The title is the h1; when the dropped heading was the page's only h1,
	// the rest already starts below it and a shift would skip a level.
	const shift = level === 1 && !hasHeading(markdown, 1) ? 0 : 1;
	let body: string;
	if (markdown.trim() !== "") body = shiftHeadings(markdown, shift);
	else {
		const pagePath = pathOf(url);
		todos.push({ text: `${name}: add the text of ${pagePath}` });
		body = `<!-- TODO: add the text of ${pagePath} -->`;
	}
	return {
		kind: "markdown",
		name,
		target: `New file at ${path}, served as text/markdown with Link: <${url.href}>; rel="canonical"; add <link rel="alternate" type="text/markdown" href="${path}"> inside <head> of ${url.href}`,
		fixes: ["markdown-twin"],
		content: `${frontmatter(page, plainTitle)}# ${title}\n\n${body}\n`,
		todos,
	};
}

/**
 * YAML frontmatter agents read before the text: title, the page's URL and its
 * description when it has one. Values are JSON strings, which YAML reads as
 * double-quoted scalars, so no site text can break out of them.
 */
function frontmatter(page: PageText, title: string): string {
	const description = cleanText(
		page.meta.description || page.meta.ogDescription,
	);
	const lines = [
		"---",
		`title: ${JSON.stringify(title)}`,
		`url: ${JSON.stringify(page.meta.canonical || page.meta.url)}`,
		...(description ? [`description: ${JSON.stringify(description)}`] : []),
		"---",
		"",
	];
	return `${lines.join("\n")}\n`;
}

/**
 * The markdown version of an HTML page, exactly as the fix files build it
 * (frontmatter, title, main content). For a site that keeps its own twins in
 * step with its pages, e.g. agentcheck.dev's legal pages.
 */
export function twinMarkdown(html: string, url: URL): string {
	const $ = load(html);
	return buildMarkdownTwin({
		meta: pageMeta($, url),
		markdown: pageMarkdown($, url),
	}).content;
}
