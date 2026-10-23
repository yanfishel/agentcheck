import { describe, expect, it } from "vitest";
import type { PageMeta } from "../../src/fixes/extract.ts";
import { buildHeadHtml } from "../../src/fixes/head.ts";

function page(extra: Partial<PageMeta> = {}): PageMeta {
	return {
		url: "https://codeframe.pro/",
		title: "CodeFrame - Frames for code",
		description: "Frames for code.",
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

const scriptBody = (content: string) =>
	content.split('ld+json">')[1]?.split("\n</script>")[0] ?? "";

describe("buildHeadHtml", () => {
	it("adds only the missing og tags", () => {
		const file = buildHeadHtml(
			page({ ogTitle: "Have", og: { "og:title": "Have" } }),
			{ og: true, jsonLd: false },
		);
		expect(file.name).toBe("head.html");
		expect(file.target).toBe("Add inside <head> of https://codeframe.pro/");
		expect(file.fixes).toEqual(["opengraph"]);
		expect(file.content).not.toContain('property="og:title"');
		expect(file.content).toContain(
			'<meta property="og:description" content="Frames for code.">',
		);
		expect(file.content).toContain(
			'<meta property="og:url" content="https://codeframe.pro/">',
		);
		expect(file.content).toContain(
			'<meta property="og:type" content="website">',
		);
		expect(file.content).toContain(
			'<meta property="og:site_name" content="CodeFrame">',
		);
	});

	it("marks a missing image as TODO", () => {
		const file = buildHeadHtml(page(), { og: true, jsonLd: false });
		expect(file.content).toContain(
			'<meta property="og:image" content="TODO: a 1200×630 image URL">',
		);
		expect(file.todos).toEqual([
			{
				text: "head.html: og:image, a 1200×630 picture (none found on the page)",
			},
		]);
	});

	it("writes WebSite and Organization JSON-LD", () => {
		const file = buildHeadHtml(
			page({ logo: "https://codeframe.pro/logo.png" }),
			{ og: false, jsonLd: true },
		);
		expect(file.fixes).toEqual(["structured-data"]);
		expect(
			file.content.match(/<script type="application\/ld\+json">/g),
		).toHaveLength(1);
		const json = JSON.parse(scriptBody(file.content));
		expect(json["@graph"]).toEqual([
			{ "@type": "WebSite", name: "CodeFrame", url: "https://codeframe.pro/" },
			{
				"@type": "Organization",
				name: "CodeFrame",
				url: "https://codeframe.pro/",
				logo: "https://codeframe.pro/logo.png",
			},
		]);
	});

	it("says to replace an unusable JSON-LD block", () => {
		const file = buildHeadHtml(
			page({ jsonLd: { present: true, usable: false, names: [] } }),
			{ og: false, jsonLd: true },
		);
		expect(file.content.split("\n")[0]).toContain(
			"replace the existing JSON-LD block",
		);
		expect(file.target).toBe(
			"Add inside <head> of https://codeframe.pro/; replace the existing JSON-LD block",
		);
	});

	it("keeps the plain target without an existing JSON-LD block", () => {
		const file = buildHeadHtml(page(), { og: false, jsonLd: true });
		expect(file.target).toBe("Add inside <head> of https://codeframe.pro/");
	});

	it("leaves out Organization when the site name is only the host", () => {
		const file = buildHeadHtml(
			page({
				siteName: "codeframe.pro",
				siteNameFromPage: false,
				logo: "https://codeframe.pro/logo.png",
			}),
			{ og: false, jsonLd: true },
		);
		const json = JSON.parse(scriptBody(file.content));
		expect(json["@graph"]).toEqual([
			{
				"@type": "WebSite",
				name: "codeframe.pro",
				url: "https://codeframe.pro/",
			},
		]);
	});

	it("escapes attribute values and script content", () => {
		const file = buildHeadHtml(
			page({ description: '"><script>', siteName: "</script>x" }),
			{ og: true, jsonLd: true },
		);
		expect(file.content).toContain("&quot;&gt;&lt;script&gt;");
		const script = scriptBody(file.content);
		expect(script).not.toContain("</");
		expect(script).toContain(`${String.fromCharCode(92)}u003c/script>x`);
	});
});
