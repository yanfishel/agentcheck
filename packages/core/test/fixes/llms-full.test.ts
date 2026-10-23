import { describe, expect, it } from "vitest";
import type { PageMeta } from "../../src/fixes/extract.ts";
import { buildLlmsTxt, llmsPages } from "../../src/fixes/llms.ts";
import {
	buildLlmsFullTxt,
	LLMS_FULL_MAX,
	type PageText,
} from "../../src/fixes/llms-full.ts";

const ORIGIN = "https://codeframe.pro";

function meta(path: string, extra: Partial<PageMeta> = {}): PageMeta {
	return {
		url: `${ORIGIN}${path}`,
		title: "",
		description: "A page.",
		siteName: "CodeFrame",
		siteNameFromPage: true,
		ogTitle: "",
		ogDescription: "",
		image: "",
		canonical: "",
		og: {},
		jsonLd: { present: false, usable: false, names: [] },
		logo: "",
		h1: "",
		links: { markdown: false, llms: false },
		...extra,
	};
}

function text(
	path: string,
	markdown: string,
	extra: Partial<PageMeta> = {},
): PageText {
	return { meta: meta(path, extra), markdown };
}

const home = text("/", "# Code screenshots\n\nTurn code into images.", {
	title: "CodeFrame | Code screenshots",
	description: "Frames for code.",
});

describe("buildLlmsFullTxt", () => {
	it("writes site header then each page as a section", () => {
		const file = buildLlmsFullTxt(home, [
			text("/editor", "# The editor\n\nType code.\n\n## Themes\n\nMany.", {
				title: "Editor | CodeFrame",
			}),
		]);
		expect(file.kind).toBe("llms-full");
		expect(file.name).toBe("llms-full.txt");
		expect(file.target).toBe("New file at /llms-full.txt");
		expect(file.fixes).toEqual(["llms-full-txt"]);
		expect(file.todos).toEqual([]);
		expect(file.content).toBe(
			[
				"# CodeFrame",
				"",
				"> Frames for code.",
				"",
				"## Code screenshots",
				"",
				"Source: https://codeframe.pro/",
				"",
				"### Code screenshots",
				"",
				"Turn code into images.",
				"",
				"## Editor",
				"",
				"Source: https://codeframe.pro/editor",
				"",
				"### The editor",
				"",
				"Type code.",
				"",
				"#### Themes",
				"",
				"Many.",
				"",
			].join("\n"),
		);
	});

	it("same pages and order as llms.txt, homepage first, no duplicates", () => {
		const menu = [meta("/editor", { title: "Editor" })];
		const sitemap = [
			meta("/", { title: "Home again" }),
			meta("/docs/a", { title: "Doc A" }),
			meta("/blog", { title: "Blog" }),
			meta("/docs/b", { title: "Doc B" }),
			meta("/editor", { title: "Editor again" }),
			meta("/x", { url: "https://other.com/x", title: "Other" }),
		];
		const llms = buildLlmsTxt(home.meta, menu, sitemap).content;
		const linked = [...llms.matchAll(/\]\((https:[^)]+)\)/g)].map((m) => m[1]);

		const ordered = llmsPages(home.meta, menu, sitemap);
		const full = buildLlmsFullTxt(
			home,
			ordered.map((page) => ({ meta: page, markdown: `Text of ${page.url}` })),
		).content;
		const sources = [...full.matchAll(/^Source: (\S+)$/gm)].map((m) => m[1]);
		expect(sources).toEqual([`${ORIGIN}/`, ...linked]);
		expect(sources).toEqual([
			`${ORIGIN}/`,
			`${ORIGIN}/editor`,
			`${ORIGIN}/docs/a`,
			`${ORIGIN}/docs/b`,
			`${ORIGIN}/blog`,
		]);
		// Duplicates handed to the builder directly are still dropped.
		const twice = buildLlmsFullTxt(home, [
			text("/", "Home"),
			text("/editor", "One"),
			text("/editor", "Two"),
		]).content;
		expect(twice.match(/^Source: /gm)).toHaveLength(2);
		expect(twice).toContain("One");
		expect(twice).not.toContain("Two");
	});

	it("TODO for a page with no content", () => {
		const file = buildLlmsFullTxt({ ...home, markdown: "" }, [
			text("/docs?page=2", "", { title: "Docs" }),
		]);
		expect(file.content).toContain(
			"## Docs\n\nSource: https://codeframe.pro/docs?page=2\n\n<!-- TODO: add the text of /docs?page=2 -->\n",
		);
		expect(file.content).toContain("<!-- TODO: add the text of / -->");
		expect(file.todos).toEqual([
			{ text: "llms-full.txt: add the text of /" },
			{ text: "llms-full.txt: add the text of /docs?page=2" },
		]);
	});

	it("TODO for a missing site description", () => {
		const file = buildLlmsFullTxt(
			text("/", "Hi", { title: "CodeFrame", description: "" }),
			[],
		);
		expect(file.content).toContain(
			"> <!-- TODO: add a description of the site -->",
		);
		expect(file.todos).toEqual([
			{ text: "llms-full.txt: add a description of the site" },
		]);
	});

	it("escapes page titles and the site name", () => {
		const file = buildLlmsFullTxt(
			text("/", "Hi", { siteName: "Code[Frame]", title: "<b>Home</b>" }),
			[],
		);
		expect(file.content.startsWith("# Code\\[Frame\\]\n")).toBe(true);
		expect(file.content).toContain("## \\<b>Home\\</b>\n");
	});

	it("escapes ampersands in the header and section titles", () => {
		const bs = String.fromCharCode(92);
		const file = buildLlmsFullTxt(
			text("/", "Hi", {
				siteName: "R&D",
				title: "Q&A",
				description: "Tags &lt;b&gt;.",
			}),
			[],
		);
		expect(
			file.content.startsWith(`# R${bs}&D\n\n> Tags ${bs}&lt;b${bs}&gt;.\n`),
		).toBe(true);
		expect(file.content).toContain(`## Q${bs}&A\n`);
	});

	it("keeps llms-full.txt under 1 MB", () => {
		const big = "word ".repeat(20_000).trim(); // ~100 KB
		const pages = Array.from({ length: 15 }, (_, i) =>
			text(`/p${i}`, big, { title: `Page ${i}` }),
		);
		const file = buildLlmsFullTxt(home, pages);
		expect(Buffer.byteLength(file.content)).toBeLessThanOrEqual(LLMS_FULL_MAX);
		const kept = file.content.match(/^Source: /gm)?.length ?? 0;
		const left = 16 - kept;
		expect(left).toBeGreaterThan(0);
		expect(kept).toBeGreaterThan(8);
		expect(file.todos).toContainEqual({
			text: `llms-full.txt: ${left} pages left out to stay under 1 MB`,
		});
		expect(file.content).toContain(
			`<!-- AgentCheck: ${left} pages left out to stay under 1 MB -->`,
		);
	});
});
