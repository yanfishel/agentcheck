import { describe, expect, it } from "vitest";
import { canonical } from "../../src/checks/canonical.ts";
import { htmlLang, isLanguageTag } from "../../src/checks/html-lang.ts";
import { metaDescription } from "../../src/checks/meta-description.ts";
import { snippetDirectives } from "../../src/checks/snippet-directives.ts";
import type { Check } from "../../src/types.ts";
import { mockRoutes, type Route } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const ORIGIN = "https://example.com";

const page = (
	head: string,
	opts: { lang?: string; body?: string; headers?: Record<string, string> } = {},
): Route => ({
	status: 200,
	contentType: "text/html",
	body: `<html${opts.lang === undefined ? "" : ` lang="${opts.lang}"`}><head>${head}</head><body>${opts.body ?? "<p>Hi</p>"}</body></html>`,
	headers: opts.headers,
});

const run = (
	check: Check,
	route: Route,
	extra: Record<string, Route> = {},
	target = `${ORIGIN}/`,
) =>
	runCheck(
		check,
		mockRoutes(ORIGIN, { [new URL(target).pathname]: route, ...extra }),
		target,
	);

describe("metadata of the page-basics checks", () => {
	it.each([
		[canonical, "canonical", "content-semantics", 10],
		[metaDescription, "meta-description", "content-semantics", 10],
		[htmlLang, "html-lang", "content-semantics", 10],
		[snippetDirectives, "snippet-directives", "bot-access", 15],
	] as const)("%#: %s", (check, id, category, weight) => {
		expect(check.id).toBe(id);
		expect(check.category).toBe(category);
		expect(check.weight).toBe(weight);
	});
});

describe("canonical", () => {
	it("passes for a self-referencing canonical without a request", async () => {
		const out = await run(
			canonical,
			page(`<link rel="canonical" href="${ORIGIN}/">`),
		);
		expect(out.status).toBe("pass");
		expect(out.message).toBe(`Canonical URL: ${ORIGIN}/`);
	});

	it("passes for a canonical on the same site that answers 200", async () => {
		const out = await run(
			canonical,
			page('<link rel="canonical" href="/main">'),
			{ "/main": page("") },
			`${ORIGIN}/copy`,
		);
		expect(out.status).toBe("pass");
	});

	it("reads a canonical Link header", async () => {
		const out = await run(
			canonical,
			page("", { headers: { link: `<${ORIGIN}/>; rel="canonical"` } }),
		);
		expect(out.status).toBe("pass");
	});

	it("fails without a canonical", async () => {
		const out = await run(canonical, page(""));
		expect(out.status).toBe("fail");
	});

	it("warns on a canonical that answers 404", async () => {
		const out = await run(
			canonical,
			page('<link rel="canonical" href="/gone">'),
		);
		expect(out.status).toBe("warn");
		expect(out.message).toContain("answers HTTP 404");
	});

	it("warns on another host and on two different canonicals", async () => {
		expect(
			(
				await run(
					canonical,
					page('<link rel="canonical" href="https://other.example/">'),
				)
			).status,
		).toBe("warn");
		const two = await run(
			canonical,
			page(
				`<link rel="canonical" href="${ORIGIN}/"><link rel="canonical" href="${ORIGIN}/b">`,
			),
		);
		expect(two.status).toBe("warn");
		expect(two.details).toHaveLength(2);
	});
});

describe("meta-description", () => {
	const text = (n: number) => "x".repeat(n);

	it("passes for a description of a fair length", async () => {
		const out = await run(
			metaDescription,
			page(`<meta name="Description" content="${text(80)}">`),
		);
		expect(out.status).toBe("pass");
		expect(out.message).toBe("Meta description present (80 characters)");
	});

	it("fails without one or with an empty one", async () => {
		expect((await run(metaDescription, page(""))).status).toBe("fail");
		expect(
			(
				await run(
					metaDescription,
					page('<meta name="description" content="  ">'),
				)
			).status,
		).toBe("fail");
	});

	it("warns when too short or too long", async () => {
		for (const n of [20, 400]) {
			const out = await run(
				metaDescription,
				page(`<meta name="description" content="${text(n)}">`),
			);
			expect(out.status).toBe("warn");
		}
	});
});

describe("html-lang", () => {
	it("passes for a valid tag, fails without one, warns on junk", async () => {
		expect((await run(htmlLang, page("", { lang: "pt-BR" }))).status).toBe(
			"pass",
		);
		expect((await run(htmlLang, page(""))).status).toBe("fail");
		expect((await run(htmlLang, page("", { lang: "" }))).status).toBe("fail");
		expect((await run(htmlLang, page("", { lang: "english!" }))).status).toBe(
			"warn",
		);
	});

	it("isLanguageTag follows BCP 47", () => {
		expect(isLanguageTag("en")).toBe(true);
		expect(isLanguageTag("zh-Hant-TW")).toBe(true);
		expect(isLanguageTag("en_US")).toBe(false);
	});
});

describe("snippet-directives", () => {
	it("passes with harmless directives", async () => {
		const out = await run(
			snippetDirectives,
			page(
				'<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">',
			),
		);
		expect(out.status).toBe("pass");
	});

	it("fails on noindex in the robots meta and nosnippet in the header", async () => {
		const meta = await run(
			snippetDirectives,
			page('<meta name="robots" content="noindex, follow">'),
		);
		expect(meta.status).toBe("fail");
		expect(meta.details).toEqual(["robots meta: noindex"]);
		const header = await run(
			snippetDirectives,
			page("", { headers: { "x-robots-tag": "nosnippet" } }),
		);
		expect(header.status).toBe("fail");
		expect(header.details).toEqual(["X-Robots-Tag: nosnippet"]);
	});

	it("reads an AI crawler's own meta and header scope", async () => {
		expect(
			(
				await run(
					snippetDirectives,
					page('<meta name="GPTBot" content="none">'),
				)
			).status,
		).toBe("fail");
		const scoped = await run(
			snippetDirectives,
			page("", {
				headers: { "x-robots-tag": "otherbot: noindex, gptbot: nosnippet" },
			}),
		);
		expect(scoped.status).toBe("fail");
		expect(scoped.details).toEqual(["X-Robots-Tag (gptbot): nosnippet"]);
	});

	it("ignores directives for crawlers that are not AI crawlers", async () => {
		const out = await run(
			snippetDirectives,
			page('<meta name="bingbot" content="noindex">', {
				headers: { "x-robots-tag": "otherbot: noindex" },
			}),
		);
		expect(out.status).toBe("pass");
	});

	it("warns on snippet limits, max-image-preview:none and data-nosnippet", async () => {
		const out = await run(
			snippetDirectives,
			page('<meta name="robots" content="max-snippet: 50">', {
				headers: { "x-robots-tag": "max-image-preview:none" },
				body: "<p data-nosnippet>secret</p><p>open</p>",
			}),
		);
		expect(out.status).toBe("warn");
		expect(out.details).toEqual([
			"robots meta: max-snippet:50",
			"X-Robots-Tag: max-image-preview:none",
			"1 element with data-nosnippet",
		]);
	});
});
