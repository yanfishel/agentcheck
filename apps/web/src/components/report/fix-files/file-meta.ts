import type { FixKind } from "@agentcheck/core/fixes";
import { CATEGORIES } from "@agentcheck/core/scoring";
import { FileCode, FileText, type LucideIcon } from "lucide-react";
import type { code } from "../../ui/code-tokens";

/** Mirrors FIX_FILES_MAX_ATTEMPTS in @agentcheck/db (a test keeps them equal; the client cannot import the db). */
export const FIX_ATTEMPTS_MAX = 3;

type CategoryId = (typeof CATEGORIES)[number]["id"];

/** Keyed by the ids of `CATEGORIES`, so a renamed category fails the typecheck. */
const CATEGORY_KINDS: Partial<Record<CategoryId, FixKind[]>> = {
	"ai-manifests": ["llms", "llms-full", "markdown"],
	"bot-access": ["robots"],
	"content-semantics": ["head"],
};

/** The files a category's footer offers; Agentic Actionability has none. */
export function kindsForCategory(categoryId: string): FixKind[] {
	const id = CATEGORIES.find((category) => category.id === categoryId)?.id;
	return id ? [...(CATEGORY_KINDS[id] ?? [])] : [];
}

export const kindFileName: Record<FixKind, string> = {
	robots: "robots.txt",
	llms: "llms.txt",
	"llms-full": "llms-full.txt",
	// The twin is named after the page (pricing.md), so there is no fixed name.
	markdown: "markdown version",
	head: "head.html",
};

/** How the block's intro names each file. */
export const kindLabel: Record<FixKind, string> = {
	robots: "robots.txt",
	llms: "llms.txt",
	"llms-full": "llms-full.txt",
	markdown: "markdown version",
	head: "head tags",
};

export const kindIcon: Record<FixKind, LucideIcon> = {
	robots: FileText,
	llms: FileText,
	"llms-full": FileText,
	markdown: FileText,
	head: FileCode,
};

/** The category footer's line: what this category gets. */
export const kindPitch: Record<FixKind, string> = {
	robots:
		"Get a ready robots.txt that keeps your rules, lets the AI crawlers in and declares content signals.",
	llms: "Get a ready llms.txt built from your site's pages.",
	"llms-full": "Get a ready llms-full.txt built from your site's pages.",
	markdown: "Get a ready markdown version of this page.",
	head: "Get ready head tags built from your page: OpenGraph, JSON-LD and the links agents look for.",
};

const PITCH_PART: Record<FixKind, string> = {
	robots: "robots.txt",
	llms: "llms.txt",
	"llms-full": "llms-full.txt",
	markdown: "a markdown version of this page",
	head: "head tags",
};

/**
 * One footer line for the applicable kinds of a category. The markdown
 * version is built from this page only, so it is named after the site files.
 */
export function categoryPitch(kinds: FixKind[]): string {
	const [only] = kinds;
	if (kinds.length === 1 && only) return kindPitch[only];
	const siteKinds = kinds.filter((kind) => kind !== "markdown");
	const parts = siteKinds.map((kind) => PITCH_PART[kind]);
	const list =
		parts.length <= 1
			? parts.join("")
			: `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
	const page = kinds.includes("markdown") ? `, and ${PITCH_PART.markdown}` : "";
	return `Get ready ${list} built from your site's pages${page}.`;
}

/** "robots.txt, llms.txt and head tags" for the kinds present. */
export function listKinds(kinds: FixKind[]): string {
	const names = kinds.map((kind) => kindLabel[kind]);
	if (names.length <= 1) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export type TodoGroup = { file: string; items: string[]; pages: string[] };

const PAGE_DESCRIPTION = "add a description of /";

/**
 * The "Fill in by hand" list, one group per file: the file prefix of each
 * TODO is dropped, and two or more "add a description of /path" items fold
 * into `pages` so a long site does not produce a long list.
 */
export function groupTodos(
	files: { name: string; todos: { text: string }[] }[],
): TodoGroup[] {
	const groups: TodoGroup[] = [];
	for (const file of files) {
		const texts = file.todos.map(({ text }) =>
			text.startsWith(`${file.name}: `)
				? text.slice(file.name.length + 2)
				: text,
		);
		if (texts.length === 0) continue;
		const pageTexts = texts.filter((text) => text.startsWith(PAGE_DESCRIPTION));
		const fold = pageTexts.length > 1;
		const items = texts
			.filter((text) => !(fold && text.startsWith(PAGE_DESCRIPTION)))
			// "og:image, …" keeps its case; sentences start with a capital.
			.map((text) =>
				/^[a-z]+:/.test(text)
					? text
					: text.charAt(0).toUpperCase() + text.slice(1),
			);
		const pages = fold
			? pageTexts.map((text) => text.slice(PAGE_DESCRIPTION.length - 1))
			: [];
		groups.push({ file: file.name, items, pages });
	}
	return groups;
}

export type Tone = keyof typeof code;
export type Segment = { text: string; tone?: Tone };

type Rule = [RegExp, Tone];

/*
 * Rules that may fail after scanning ahead (comments, link text) are bounded,
 * so a long run of unclosed "[" or "<!--" stays linear instead of quadratic;
 * longer spans simply stay plain.
 */
const LLMS_RULES: Rule[] = [
	[/<!--\s*TODO[\s\S]{0,1000}?-->/y, "warn"],
	[/<!--[\s\S]{0,1000}?-->/y, "muted"],
	[/(?<=^|\n)#{1,6} [^\n]*/y, "key"],
	[/\[(?:[^\]\\\n]|\\.){0,300}\]/y, "string"],
	[/https?:\/\/[^\s)]+/y, "flag"],
];

/** One rule per alternative, tried in order at each position. */
const RULES: Record<FixKind, Rule[]> = {
	robots: [
		[/#[^\n]*/y, "muted"],
		[/https?:\/\/\S+/y, "flag"],
		[/(?<=^|\n)[A-Za-z-]+(?=[ \t]*:)/y, "key"],
	],
	llms: LLMS_RULES,
	"llms-full": LLMS_RULES,
	markdown: LLMS_RULES,
	head: [
		[/<!--[\s\S]{0,1000}?-->/y, "muted"],
		[/"(?:[^"\\\n]|\\.)*"(?=[ \t]*:)/y, "key"],
		[/"TODO:(?:[^"\\\n]|\\.)*"/y, "warn"],
		[/"https?:\/\/(?:[^"\\\n]|\\.)*"/y, "flag"],
		[/"(?:[^"\\\n]|\\.)*"/y, "string"],
		[/<\/?[A-Za-z][\w-]*|\/?>/y, "key"],
	],
};

/**
 * Splits a fix file into coloured segments for the code window. The segments
 * always join back to the exact text; colouring is only a hint, the content is
 * rendered as React text.
 */
export function highlight(kind: FixKind, text: string): Segment[] {
	const rules = RULES[kind];
	const segments: Segment[] = [];
	let plain = "";
	let index = 0;
	while (index < text.length) {
		let matched: Segment | null = null;
		for (const [pattern, tone] of rules) {
			pattern.lastIndex = index;
			const match = pattern.exec(text);
			if (match && match[0].length > 0) {
				matched = { text: match[0], tone };
				break;
			}
		}
		if (matched) {
			if (plain) segments.push({ text: plain });
			plain = "";
			segments.push(matched);
			index += matched.text.length;
		} else {
			plain += text[index];
			index++;
		}
	}
	if (plain) segments.push({ text: plain });
	return segments;
}
