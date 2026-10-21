import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
	PAGE_MARKDOWN_MAX,
	pageMarkdown,
	shiftHeadings,
} from "../../src/fixes/markdown.ts";

const fixture = (name: string) =>
	readFileSync(new URL(`../fixtures/fixes/${name}`, import.meta.url), "utf8");
const base = new URL("https://codeframe.pro/pricing");
const md = (html: string) => pageMarkdown(load(html), base);

describe("pageMarkdown", () => {
	it("converts headings, paragraphs, lists, links, emphasis, code, quotes, tables and images", () => {
		expect(pageMarkdown(load(fixture("article.html")), base)).toBe(
			[
				"# Plans and pricing",
				"",
				"Pick a **plan** that fits. Read the [FAQ](https://codeframe.pro/docs/faq) or *email* us.",
				"",
				"## Features",
				"",
				"- Themes",
				"  - Light",
				"  - Dark",
				"- Export to `PNG`",
				"",
				"1. Sign up",
				"2. Pay",
				"",
				"> Best tool ever.",
				"",
				"```js",
				"const a = 1;",
				"",
				"",
				"console.log(a);",
				"```",
				"",
				"---",
				"",
				"| Plan | Price |",
				"| --- | --- |",
				"| Free | $0 |",
				"| Pro | $9 |",
				"",
				"![Editor screenshot](https://codeframe.pro/img/shot.png)",
				"",
				"Line one",
				"Line two",
			].join("\n"),
		);
	});

	it("picks main, then role=main, then article, else body without chrome", () => {
		const page = (inner: string) =>
			`<html><body><header>Top</header><nav>Menu</nav>${inner}<aside>Side</aside><footer>Bottom</footer></body></html>`;
		expect(
			md(page("<article>A</article><main>M</main><div role='main'>R</div>")),
		).toBe("M");
		expect(md(page("<article>A</article><div role='main'>R</div>"))).toBe("R");
		expect(md(page("<p>Intro</p><article>A</article>"))).toBe("A");
		expect(
			md(
				page(
					"<p>Body</p><div role='navigation'>Links</div><p hidden>Gone</p><p aria-hidden='true'>Gone</p>",
				),
			),
		).toBe("Body");
	});

	it("returns empty for a shell page", () => {
		expect(pageMarkdown(load(fixture("shell.html")), base)).toBe("");
	});

	it("escapes markdown-looking text", () => {
		const out = md(
			"<main><p># not a heading</p><p>[x](y) and &lt;script&gt;alert(1)&lt;/script&gt;</p><p>> quote</p><p>- item</p><p>+ plus</p><p>* star</p><p>1. one</p><h2># hash</h2></main>",
		);
		const bs = String.fromCharCode(92);
		expect(out).toBe(
			[
				`${bs}# not a heading`,
				`${bs}[x${bs}]${bs}(y${bs}) and ${bs}<script>alert${bs}(1${bs})${bs}</script>`,
				`${bs}> quote`,
				`${bs}- item`,
				`${bs}+ plus`,
				`${bs}* star`,
				`1${bs}. one`,
				`## ${bs}# hash`,
			].join("\n\n"),
		);
		expect(out.replaceAll(`${bs}<`, "")).not.toContain("<");
	});

	it("fences longer than any backtick run", () => {
		const out = md(
			"<main><pre>a ```` b\n`c`</pre><p><code>x `y` z</code></p></main>",
		);
		expect(out).toBe("`````\na ```` b\n`c`\n`````\n\n``x `y` z``");
	});

	it("drops non-http links", () => {
		expect(
			md(
				"<main><p><a href='javascript:alert(1)'>Run</a> <a href='mailto:a@b.c'>Mail</a> <a href='#top'>Top</a> <a href='https://other.example/x'>Other</a></p></main>",
			),
		).toBe("Run Mail Top [Other](https://other.example/x)");
	});

	it("percent-encodes backslashes in link and image destinations", () => {
		const bs = String.fromCharCode(92);
		const out = md(
			`<main><p><a href="https://other.example/?q=a${bs}">Q</a> <img src="https://other.example/i.png?x=${bs}" alt="I"></p></main>`,
		);
		expect(out).toBe(
			"[Q](https://other.example/?q=a%5C) ![I](https://other.example/i.png?x=%5C)",
		);
		expect(out.includes(bs)).toBe(false);
	});

	it("collapses whitespace and blank lines", () => {
		expect(
			md(
				"<main>\n\n  <p>  a \n\t b  </p>\n\n\n<div>\n</div><p></p><p>c<br><br><br>d</p>\n\n</main>",
			),
		).toBe("a b\n\nc\nd");
	});

	it("cuts at 100 KB", () => {
		const para = `<p>${"word ".repeat(200).trim()}</p>`;
		const out = md(`<main>${para.repeat(200)}</main>`);
		expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(
			PAGE_MARKDOWN_MAX,
		);
		expect(out.endsWith("\n\n<!-- AgentCheck: page cut at 100 KB -->")).toBe(
			true,
		);
		const body = out.slice(0, out.lastIndexOf("\n\n<!--"));
		for (const block of body.split("\n\n")) {
			expect(block).toBe("word ".repeat(200).trim());
		}
	});

	it("writes uneven tables one line per row and escapes pipes", () => {
		const bs = String.fromCharCode(92);
		expect(
			md(
				"<main><table><tr><td>a|b</td><td>c</td></tr><tr><td>d</td></tr></table></main>",
			),
		).toBe([`a${bs}|b | c`, "d"].join("\n"));
	});

	it("escapes a leading backtick or tilde so text cannot open a fence", () => {
		const bs = String.fromCharCode(92);
		expect(md("<main><p>```js</p><h2>after</h2></main>")).toBe(
			`${bs}\`\`\`js\n\n## after`,
		);
		expect(md("<main><p>a<br>```<br>b</p></main>")).toBe(`a\n${bs}\`\`\`\nb`);
		expect(md("<main><p>~~~</p></main>")).toBe(`${bs}~~~`);
	});

	it("escapes a text ! right before a link", () => {
		const bs = String.fromCharCode(92);
		expect(md("<main><p>Wow!<a href='/i'>x</a></p></main>")).toBe(
			`Wow${bs}![x](https://codeframe.pro/i)`,
		);
		expect(md("<main><p>Wow! <a href='/i'>x</a></p></main>")).toBe(
			"Wow! [x](https://codeframe.pro/i)",
		);
	});

	it("closes a fence when an oversized first code block is cut", () => {
		const out = md(`<main><pre>${"line of code\n".repeat(20000)}</pre></main>`);
		expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(
			PAGE_MARKDOWN_MAX,
		);
		expect(out.startsWith("```\nline of code\n")).toBe(true);
		expect(
			out.endsWith(
				"line of code\n```\n\n<!-- AgentCheck: page cut at 100 KB -->",
			),
		).toBe(true);
		expect(out.split("\n").filter((line) => line === "```")).toHaveLength(2);
	});

	it("cuts an oversized first paragraph on code points", () => {
		const out = md(`<main><p>${"é".repeat(80000)}</p></main>`);
		const size = Buffer.byteLength(out, "utf8");
		expect(size).toBeLessThanOrEqual(PAGE_MARKDOWN_MAX);
		expect(size).toBeGreaterThan(PAGE_MARKDOWN_MAX - 100);
		expect(out).toMatch(/^é+\n\n<!-- AgentCheck: page cut at 100 KB -->$/);
	});

	it("ignores content nested too deep instead of throwing", () => {
		const depth = 5000;
		const html = `<main><p>top</p>${"<div>".repeat(depth)}deep${"</div>".repeat(depth)}</main>`;
		expect(md(html)).toBe("top");
	});

	it("indents nested ordered lists by the marker width", () => {
		expect(md("<main><ol><li>a<ol><li>b</li></ol></li></ol></main>")).toBe(
			"1. a\n   1. b",
		);
	});
});

describe("shiftHeadings", () => {
	it("shifts ATX headings and caps at ######", () => {
		expect(shiftHeadings("# A\n### B", 2)).toBe("### A\n##### B");
		expect(shiftHeadings("##### A\ntext # not\n###### B", 2)).toBe(
			"###### A\ntext # not\n###### B",
		);
	});

	it("leaves fenced code alone", () => {
		const text = ["# A", "```", "# shell comment", "```"].join("\n");
		expect(shiftHeadings(text, 1)).toBe(
			["## A", "```", "# shell comment", "```"].join("\n"),
		);
	});
});

describe("pageMarkdown and hidden content", () => {
	it("keeps content hidden until found (collapsed answers), drops the rest", () => {
		expect(
			md(
				"<main><h2>Q</h2><div hidden='until-found'>Answer</div><div hidden>Gone</div><div HIDDEN='Until-Found'>Also</div><div hidden=''>Gone</div><p aria-hidden='true'>Gone</p></main>",
			),
		).toBe("## Q\n\nAnswer\n\nAlso");
	});
});

describe("pageMarkdown and stacked phrasing elements", () => {
	it("separates words that elements stacked without whitespace would glue", () => {
		expect(md("<main><p><span>80</span><span>of 100</span></p></main>")).toBe(
			"80 of 100",
		);
		expect(md("<main><p><b>Agent</b><i>Check</i></p></main>")).toBe(
			"**Agent** *Check*",
		);
		expect(
			md("<main><p><a href='/more'>Read</a><span>more</span></p></main>"),
		).toBe("[Read](https://codeframe.pro/more) more");
		expect(
			md(
				"<main><div><span><span>80</span><span>of 100</span></span></div></main>",
			),
		).toBe("80 of 100");
	});

	it("leaves symbols, text runs and existing whitespace alone", () => {
		expect(md("<main><p><span>$</span><span>99</span></p></main>")).toBe("$99");
		expect(md("<main><p>Hel<span>lo</span><span>!</span></p></main>")).toBe(
			"Hello!",
		);
		expect(md("<main><p><span>Score</span> <span>80</span></p></main>")).toBe(
			"Score 80",
		);
		expect(md("<main><p><span>a</span><br><span>b</span></p></main>")).toBe(
			"a\nb",
		);
	});
});

describe("pageMarkdown and disclosure buttons", () => {
	it("keeps the text of a button that opens content, drops other controls", () => {
		expect(
			md(
				"<main><h3><button type='button' aria-expanded='false'>Why?<svg aria-hidden='true'></svg></button></h3><div hidden>Closed answer</div><div hidden='until-found'>Found answer</div><button type='button'>Buy</button><p>End</p></main>",
			),
		).toBe("### Why?\n\nClosed answer\n\nFound answer\n\nEnd");
	});

	it("drops hidden content that no disclosure button precedes", () => {
		expect(
			md(
				"<main><p>Intro</p><div hidden>Gone</div><h3>Plain</h3><div hidden>Gone too</div></main>",
			),
		).toBe("Intro\n\n### Plain");
	});
});
