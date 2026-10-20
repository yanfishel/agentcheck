import type { PageMeta } from "./extract.ts";
import { cleanText, escapeMarkdown } from "./text.ts";
import type { FixFile, FixTodo } from "./types.ts";

/** Title separators, spaced on both sides: "A | B", "A :: B", "A — B"… */
const SEPARATOR = / (?:[|]|–|-|—|::|»|·) /;

const parts = (title: string) =>
	title
		.split(SEPARATOR)
		.map((part) => part.trim())
		.filter(Boolean);

/**
 * Drops the title parts that name the site: the site name itself and every
 * part the homepage title also has ("News | Site :: Politics" → "Politics").
 */
function stripSiteName(
	title: string,
	siteName: string,
	homeTitle: string,
): string {
	const shared = new Set(
		[siteName, ...parts(homeTitle)].map((part) => part.toLowerCase()),
	);
	return parts(title)
		.filter((part) => !shared.has(part.toLowerCase()))
		.join(" – ");
}

export function pathOf(url: URL): string {
	return `${url.pathname}${url.search}`;
}

export function pageTitle(
	page: PageMeta,
	home: PageMeta,
	siteName: string,
	url: URL,
): string {
	const picked = page.ogTitle || page.title;
	// The homepage itself keeps what it shares with its own title.
	const homeTitle = page.url === home.url ? "" : home.title;
	const stripped = stripSiteName(cleanText(picked), siteName, homeTitle);
	return stripped || page.h1 || pathOf(url);
}

/** Re-serialises through URL; only http(s) on the site's own host is kept. */
export function safeUrl(value: string, host: string): URL | null {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return null;
	if (url.host !== host) return null;
	return url;
}

/** Parentheses are percent-encoded so they cannot close a markdown link. */
function linkTarget(url: URL): string {
	return url.href.replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function decodeSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function groupName(url: URL): string {
	const segments = url.pathname.split("/").filter(Boolean);
	if (segments.length < 2) return "Pages";
	// Only letters and digits survive, everything else becomes a space: the heading is untrusted text.
	const words = cleanText(
		decodeSegment(segments[0] ?? "").replace(/[^\p{L}\p{N}]+/gu, " "),
		60,
	);
	return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Pages";
}

interface Entry {
	url: URL;
	page: PageMeta;
}

interface Listing {
	sections: [string, Entry[]][];
	/** A single-page site: the root page itself is the one entry. */
	single: boolean;
}

/** The pages llms.txt lists, grouped and ordered into its sections; each URL once, never the homepage itself unless it is the only page. */
function listPages(
	home: PageMeta,
	menu: PageMeta[],
	pages: PageMeta[],
): Listing {
	const homeUrl = new URL(home.url);
	const seen = new Set<string>([homeUrl.href]);
	const take = (list: PageMeta[]): Entry[] => {
		const out: Entry[] = [];
		for (const page of list) {
			const url = safeUrl(page.url, homeUrl.host);
			if (!url || seen.has(url.href)) continue;
			seen.add(url.href);
			out.push({ url, page });
		}
		return out;
	};

	const mainEntries = take(menu);
	const sitemapEntries = take(pages);
	const single = mainEntries.length === 0 && sitemapEntries.length === 0;
	if (single) {
		seen.delete(homeUrl.href);
		sitemapEntries.push(...take([home]));
	}

	const groups = new Map<string, Entry[]>();
	for (const item of sitemapEntries) {
		const name = groupName(item.url);
		groups.set(name, [...(groups.get(name) ?? []), item]);
	}
	const loose: Entry[] = [];
	const named: [string, Entry[]][] = [];
	for (const [name, entries] of groups) {
		if (name === "Pages" || entries.length < 2) loose.push(...entries);
		else named.push([name, entries]);
	}

	const sections: [string, Entry[]][] = [];
	if (mainEntries.length > 0) sections.push(["Main pages", mainEntries]);
	sections.push(...named);
	if (loose.length > 0) sections.push(["Pages", loose]);
	return { sections, single };
}

/**
 * The pages llms.txt links to, in the order it lists them (menu, then the
 * sitemap groups); the homepage itself is never included. llms-full.txt
 * follows this order after the homepage.
 */
export function llmsPages(
	home: PageMeta,
	menu: PageMeta[],
	pages: PageMeta[],
): PageMeta[] {
	const { sections, single } = listPages(home, menu, pages);
	if (single) return [];
	return sections.flatMap(([, entries]) => entries.map((entry) => entry.page));
}

export function buildLlmsTxt(
	home: PageMeta,
	menu: PageMeta[],
	pages: PageMeta[],
): FixFile {
	const todos: FixTodo[] = [];
	const homeUrl = new URL(home.url);
	const siteName = home.siteName || homeUrl.hostname;
	const { sections, single } = listPages(home, menu, pages);

	const line = ({ url, page }: Entry): string => {
		const head = `- [${escapeMarkdown(pageTitle(page, home, siteName, url))}](${linkTarget(url)})`;
		const description = page.description || page.ogDescription;
		if (description) {
			return `${head}: ${escapeMarkdown(cleanText(description, 300))}`;
		}
		const path = pathOf(url);
		todos.push({ text: `llms.txt: add a description of ${path}` });
		return `${head}: <!-- TODO: add a description of ${path} -->`;
	};
	const lines = sections.map(
		([name, entries]) => [name, entries.map(line)] as const,
	);
	if (single) {
		// A single-page site: the root page itself is the one link, and the owner
		// is asked for the rest.
		todos.push({
			text: "llms.txt: add links to your key pages (none found in the menu or sitemap)",
		});
	}

	const description = home.description || home.ogDescription;
	let summary: string;
	if (description) {
		summary = escapeMarkdown(cleanText(description, 300));
	} else {
		summary = "<!-- TODO: add a description of the site -->";
		todos.push({ text: "llms.txt: add a description of the site" });
	}

	const body = lines
		.map(([name, items]) => `## ${name}\n\n${items.join("\n")}`)
		.join("\n\n");
	const content = `# ${escapeMarkdown(siteName)}\n\n> ${summary}\n\n${body}\n`;

	return {
		kind: "llms",
		name: "llms.txt",
		target: "New file at /llms.txt",
		fixes: ["llms-txt", "llms-txt-format"],
		content,
		todos,
	};
}
