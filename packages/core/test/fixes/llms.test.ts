import { describe, expect, it } from "vitest";
import { llmsTxtFormat } from "../../src/checks/llms-txt-format.ts";
import type { PageMeta } from "../../src/fixes/extract.ts";
import { buildLlmsTxt } from "../../src/fixes/llms.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

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
		...extra,
	};
}

const home = meta("/", { description: "Frames for code." });

describe("buildLlmsTxt", () => {
	it("writes the llmstxt.org shape", async () => {
		const file = buildLlmsTxt(
			home,
			[meta("/editor", { title: "Editor", description: "The editor." })],
			[],
		);
		expect(file.name).toBe("llms.txt");
		expect(file.target).toBe("New file at /llms.txt");
		expect(file.fixes).toEqual(["llms-txt", "llms-txt-format"]);
		expect(
			file.content.startsWith(
				"# CodeFrame\n\n> Frames for code.\n\n## Main pages\n\n- [Editor](https://codeframe.pro/editor): The editor.",
			),
		).toBe(true);
		const out = await runCheck(
			llmsTxtFormat,
			mockRoutes(ORIGIN, {
				"/": { status: 200, contentType: "text/html", body: "<html></html>" },
				"/llms.txt": {
					status: 200,
					contentType: "text/plain",
					body: file.content,
				},
			}),
			`${ORIGIN}/`,
		);
		expect(out.status).toBe("pass");
	});

	it("lists the root page when no menu or sitemap page is found", async () => {
		const file = buildLlmsTxt(
			meta("/", {
				title: "CodeFrame | Code screenshots",
				description: "Frames for code.",
			}),
			[],
			[],
		);
		expect(file.content).toBe(
			`# CodeFrame

> Frames for code.

## Pages

- [Code screenshots](https://codeframe.pro/): Frames for code.
`,
		);
		expect(file.todos).toEqual([
			{
				text: "llms.txt: add links to your key pages (none found in the menu or sitemap)",
			},
		]);
		const out = await runCheck(
			llmsTxtFormat,
			mockRoutes(ORIGIN, {
				"/": { status: 200, contentType: "text/html", body: "<html></html>" },
				"/llms.txt": {
					status: 200,
					contentType: "text/plain",
					body: file.content,
				},
			}),
			`${ORIGIN}/`,
		);
		expect(out.status).toBe("pass");
	});

	it("marks the root page's missing description when it is the only link", () => {
		const file = buildLlmsTxt(meta("/", { description: "" }), [], []);
		expect(file.content).toContain(
			`## Pages

- [/](https://codeframe.pro/): <!-- TODO: add a description of / -->`,
		);
		expect(file.todos.map((t) => t.text)).toContain(
			"llms.txt: add links to your key pages (none found in the menu or sitemap)",
		);
	});

	it("groups sitemap pages by first path segment", () => {
		const file = buildLlmsTxt(
			home,
			[],
			[
				meta("/docs/a", { title: "A" }),
				meta("/docs/b", { title: "B" }),
				meta("/blog/x", { title: "X" }),
				meta("/about", { title: "About" }),
			],
		);
		expect(file.content).toContain(
			"## Docs\n\n- [A](https://codeframe.pro/docs/a): A page.\n- [B](https://codeframe.pro/docs/b): A page.",
		);
		expect(file.content).toContain(
			"## Pages\n\n- [X](https://codeframe.pro/blog/x): A page.\n- [About](https://codeframe.pro/about): A page.",
		);
		expect(file.content).not.toContain("## Blog");
	});

	it("marks a missing description as TODO", () => {
		const file = buildLlmsTxt(
			home,
			[meta("/themes", { title: "Themes", description: "" })],
			[],
		);
		expect(file.content).toContain(
			"- [Themes](https://codeframe.pro/themes): <!-- TODO: add a description of /themes -->",
		);
		expect(file.todos).toContainEqual({
			text: "llms.txt: add a description of /themes",
		});
	});

	it("escapes titles", () => {
		const file = buildLlmsTxt(home, [meta("/x", { title: "A [b] (c)" })], []);
		const bs = String.fromCharCode(92);
		expect(file.content).toContain(
			`[A ${bs}[b${bs}] ${bs}(c${bs})](https://codeframe.pro/x)`,
		);
	});

	it("escapes ampersands and still passes the llms.txt format check", async () => {
		const bs = String.fromCharCode(92);
		const file = buildLlmsTxt(
			meta("/", { siteName: "R&D", description: "Tags &lt;b&gt; & more." }),
			[meta("/x", { title: "Q&A", description: "Ask &amp; answer." })],
			[],
		);
		expect(file.content).toContain(`# R${bs}&D\n`);
		expect(file.content).toContain(`> Tags ${bs}&lt;b${bs}&gt; ${bs}& more.`);
		expect(file.content).toContain(
			`- [Q${bs}&A](https://codeframe.pro/x): Ask ${bs}&amp; answer.`,
		);
		const out = await runCheck(
			llmsTxtFormat,
			mockRoutes(ORIGIN, {
				"/": { status: 200, contentType: "text/html", body: "<html></html>" },
				"/llms.txt": {
					status: 200,
					contentType: "text/plain",
					body: file.content,
				},
			}),
			`${ORIGIN}/`,
		);
		expect(out.status).toBe("pass");
	});

	it("escapes a trailing backslash in a title so the link stays a link", () => {
		const bs = String.fromCharCode(92);
		const file = buildLlmsTxt(
			home,
			[meta("/price", { title: `Price C:${bs}` })],
			[],
		);
		expect(file.content).toContain(
			`- [Price C:${bs}${bs}](https://codeframe.pro/price): A page.`,
		);
	});

	it("strips the site name from page titles", () => {
		const file = buildLlmsTxt(
			home,
			[meta("/pricing", { title: "Pricing | CodeFrame" })],
			[],
		);
		expect(file.content).toContain(
			"- [Pricing](https://codeframe.pro/pricing)",
		);
	});

	it("strips the parts a page title shares with the homepage title", () => {
		const news = meta("/", {
			title: "Новости | NEWS.SamplePortal.co.uk",
			siteName: "SamplePortal",
		});
		const file = buildLlmsTxt(
			news,
			[
				meta("/politics/", {
					title: "Новости | NEWS.SamplePortal.co.uk :: Политика",
				}),
				meta("/contact", { title: "Новости", h1: "Контакты" }),
			],
			[],
		);
		expect(file.content).toContain(
			"- [Политика](https://codeframe.pro/politics/)",
		);
		expect(file.content).toContain(
			"- [Контакты](https://codeframe.pro/contact)",
		);
	});

	it("skips other hosts, other schemes and the homepage itself", () => {
		const file = buildLlmsTxt(
			home,
			[
				meta("/"),
				{ ...meta("/e", { title: "E" }), url: "https://evil.example/e" },
				{ ...meta("/j", { title: "J" }), url: "javascript:alert(1)" },
				meta("/ok", { title: "Ok" }),
			],
			[],
		);
		expect(file.content).not.toContain("evil.example");
		expect(file.content).not.toContain("javascript");
		expect(file.content).toContain("[Ok]");
		expect(file.content.match(/^- /gm)).toHaveLength(1);
	});

	it("percent-encodes parentheses in URLs", () => {
		const file = buildLlmsTxt(home, [meta("/a(b)", { title: "T" })], []);
		expect(file.content).toContain("(https://codeframe.pro/a%28b%29)");
	});

	it("sanitises group headings from encoded path segments", () => {
		const file = buildLlmsTxt(
			home,
			[],
			[
				meta("/%3Cscript%3E%5Bx%5D(y)/a", { title: "A" }),
				meta("/%3Cscript%3E%5Bx%5D(y)/b", { title: "B" }),
				meta("/%23%3C!--/a", { title: "C" }),
				meta("/%23%3C!--/b", { title: "D" }),
			],
		);
		const headings = file.content
			.split(String.fromCharCode(10))
			.filter((line) => line.startsWith("## "));
		expect(headings).toEqual(["## Script x y", "## Pages"]);
		for (const heading of headings) {
			for (const raw of ["<", "[", "(", "!--", "#"]) {
				expect(heading.slice(3)).not.toContain(raw);
			}
		}
	});
});
