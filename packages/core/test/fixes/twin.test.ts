import { describe, expect, it } from "vitest";
import { markdownTwin } from "../../src/checks/markdown-twin.ts";
import type { PageMeta } from "../../src/fixes/extract.ts";
import { buildMarkdownTwin, twinName, twinPath } from "../../src/fixes/twin.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const ORIGIN = "https://codeframe.pro";

function meta(path: string, extra: Partial<PageMeta> = {}): PageMeta {
	return {
		url: `${ORIGIN}${path}`,
		title: "",
		description: "",
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

describe("twinName / twinPath", () => {
	it("twin names", () => {
		const cases: [string, string, string][] = [
			["/", "index.md", "/index.md"],
			["/pricing", "pricing.md", "/pricing.md"],
			["/docs/", "docs.md", "/docs.md"],
			["/docs/intro", "intro.md", "/docs/intro.md"],
			["/a b/Ü", "u.md", "/a%20b/%C3%9C.md"],
			["/a b/日本", "page.md", "/a%20b/%E6%97%A5%E6%9C%AC.md"],
			["/Guide_v2.0?x=1#top", "guide_v2.0.md", "/Guide_v2.0.md"],
			["/--x--", "x.md", "/--x--.md"],
			// Never collides with the pack files README.md / AGENT-PROMPT.md.
			["/readme", "readme-page.md", "/readme.md"],
			["/README", "readme-page.md", "/README.md"],
			["/docs/ReadMe/", "readme-page.md", "/docs/ReadMe.md"],
			["/Agent-Prompt", "agent-prompt-page.md", "/Agent-Prompt.md"],
			["/agent prompt", "agent-prompt-page.md", "/agent%20prompt.md"],
			["/readme-old", "readme-old.md", "/readme-old.md"],
			// Windows device names get a suffix.
			["/con", "con-page.md", "/con.md"],
			["/NUL", "nul-page.md", "/NUL.md"],
			["/com1", "com1-page.md", "/com1.md"],
			["/lpt9", "lpt9-page.md", "/lpt9.md"],
			["/aux.v2", "aux.v2-page.md", "/aux.v2.md"],
			["/com10", "com10.md", "/com10.md"],
		];
		for (const [path, name, probed] of cases) {
			const url = new URL(path, ORIGIN);
			expect([path, twinName(url)]).toEqual([path, name]);
			expect([path, twinPath(url)]).toEqual([path, probed]);
			expect(twinName(url)).toMatch(/^[a-z0-9][a-z0-9._-]*\.md$/);
		}
	});

	it("twinPath is the .md URL the markdown-twin check probes", async () => {
		for (const path of ["/", "/pricing", "/docs/", "/a b/Ü?q=1"]) {
			const target = new URL(path, ORIGIN);
			const agent = mockRoutes(ORIGIN, {
				[target.pathname + target.search]: {
					status: 200,
					contentType: "text/html",
					body: "<html><head></head><body></body></html>",
				},
			});
			const result = await runCheck(markdownTwin, agent, target.href);
			expect(result.status).toBe("fail");
			expect(result.details?.at(-1)).toBe(
				`${ORIGIN}${twinPath(target)}: HTTP 404`,
			);
		}
	});
});

describe("buildMarkdownTwin", () => {
	it("twin starts with the page title", () => {
		const file = buildMarkdownTwin({
			meta: meta("/pricing", { title: "Pricing | CodeFrame" }),
			markdown: "# Plans\n\nPick one.",
		});
		expect(file.kind).toBe("markdown");
		expect(file.name).toBe("pricing.md");
		expect(file.fixes).toEqual(["markdown-twin"]);
		expect(file.todos).toEqual([]);
		expect(file.content).toBe(
			"# Pricing | CodeFrame\n\n## Plans\n\nPick one.\n",
		);
	});

	it("drops the page's leading heading when it repeats the title", () => {
		const file = buildMarkdownTwin({
			meta: meta("/pricing", { title: "Pricing | CodeFrame" }),
			markdown: "# Pricing | CodeFrame\n\nPick one.\n\n# Pricing | CodeFrame",
		});
		expect(file.content).toBe(
			"# Pricing | CodeFrame\n\nPick one.\n\n## Pricing | CodeFrame\n",
		);
		const escaped = buildMarkdownTwin({
			meta: meta("/", { title: "[Home]" }),
			markdown: "## \\[Home\\]\n\nHi",
		});
		expect(escaped.content).toBe("# \\[Home\\]\n\nHi\n");
		const only = buildMarkdownTwin({
			meta: meta("/docs", { title: "Docs" }),
			markdown: "# Docs",
		});
		expect(only.content).toBe(
			"# Docs\n\n<!-- TODO: add the text of /docs -->\n",
		);
		expect(only.todos).toEqual([{ text: "docs.md: add the text of /docs" }]);
	});

	it("keeps heading levels when the dropped heading was the page's only h1", () => {
		const file = buildMarkdownTwin({
			meta: meta("/pricing", { title: "Pricing" }),
			markdown:
				"# Pricing\n\nPick one.\n\n## Plans\n\n### Pro\n\n```\n# not a heading\n```",
		});
		expect(file.content).toBe(
			"# Pricing\n\nPick one.\n\n## Plans\n\n### Pro\n\n```\n# not a heading\n```\n",
		);
		const second = buildMarkdownTwin({
			meta: meta("/pricing", { title: "Pricing" }),
			markdown: "# Pricing\n\n## Plans\n\n# Extras",
		});
		expect(second.content).toBe("# Pricing\n\n### Plans\n\n## Extras\n");
		const kept = buildMarkdownTwin({
			meta: meta("/pricing", { title: "Plans" }),
			markdown: "# Pricing\n\n## Plans",
		});
		expect(kept.content).toBe("# Plans\n\n## Pricing\n\n### Plans\n");
	});

	it("escapes ampersands in the title and keeps entity text literal", () => {
		const bs = String.fromCharCode(92);
		const file = buildMarkdownTwin({
			meta: meta("/qa", { title: "Q&A &lt;b&gt;" }),
			markdown: "Hi",
		});
		expect(file.content).toBe(`# Q${bs}&A ${bs}&lt;b${bs}&gt;\n\nHi\n`);
	});

	it("escapes the title", () => {
		const file = buildMarkdownTwin({
			meta: meta("/", { title: "[Home](x)" }),
			markdown: "Hi",
		});
		expect(file.content.startsWith("# \\[Home\\]\\(x\\)\n\n")).toBe(true);
	});

	it("TODO for a page with no content", () => {
		const file = buildMarkdownTwin({
			meta: meta("/docs/", { title: "Docs" }),
			markdown: "",
		});
		expect(file.content).toBe(
			"# Docs\n\n<!-- TODO: add the text of /docs/ -->\n",
		);
		expect(file.todos).toEqual([{ text: "docs.md: add the text of /docs/" }]);
	});

	it("target names the link tag", () => {
		const file = buildMarkdownTwin({
			meta: meta("/pricing?plan=pro", { title: "Pricing" }),
			markdown: "Text",
		});
		expect(file.target).toBe(
			'New file at /pricing.md, served as text/markdown; add <link rel="alternate" type="text/markdown" href="/pricing.md"> inside <head> of https://codeframe.pro/pricing?plan=pro',
		);
	});
});
