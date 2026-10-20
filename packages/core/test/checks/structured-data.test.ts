import { describe, expect, it } from "vitest";
import { structuredData } from "../../src/checks/structured-data.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const run = (html: string) =>
	runCheck(
		structuredData,
		mockRoutes("https://example.com", {
			"/": { status: 200, contentType: "text/html", body: html },
		}),
		"https://example.com/",
	);

const ld = (json: string, type = "application/ld+json") =>
	`<script type="${type}">${json}</script>`;

describe("structured-data", () => {
	it("has the expected metadata", () => {
		expect(structuredData.id).toBe("structured-data");
		expect(structuredData.weight).toBe(25);
		expect(structuredData.category).toBe("content-semantics");
	});

	it("passes for schema.org JSON-LD", async () => {
		const out = await run(
			ld('{"@context": "https://schema.org", "@type": "Thing"}'),
		);
		expect(out.status).toBe("pass");
	});

	it("accepts http with trailing slash", async () => {
		const out = await run(ld('{"@context": "http://schema.org/"}'));
		expect(out.status).toBe("pass");
	});

	it.each([
		"https://schema.org",
		"http://schema.org/",
		"https://www.schema.org/",
		"https://schema.org/Thing",
	])("accepts the context %s", async (context) => {
		const out = await run(ld(JSON.stringify({ "@context": context })));
		expect(out.status).toBe("pass");
	});

	it.each(["https://schema.org.evil.com", "https://schema.organic.example"])(
		"rejects the lookalike context %s",
		async (context) => {
			const out = await run(ld(JSON.stringify({ "@context": context })));
			expect(out.status).toBe("fail");
		},
	);

	it("accepts array and object context forms", async () => {
		expect(
			(await run(ld('{"@context": ["https://schema.org", {"x": "y"}]}')))
				.status,
		).toBe("pass");
		expect(
			(await run(ld('{"@context": {"@vocab": "https://schema.org/"}}'))).status,
		).toBe("pass");
	});

	it("accepts a context nested in @graph", async () => {
		const out = await run(
			ld('{"@graph": [{"@context": "https://schema.org", "@type": "Thing"}]}'),
		);
		expect(out.status).toBe("pass");
	});

	it("matches the script type case-insensitively", async () => {
		const out = await run(
			ld('{"@context": "https://schema.org"}', "Application/LD+JSON"),
		);
		expect(out.status).toBe("pass");
	});

	it("passes when one of several blocks is valid", async () => {
		const out = await run(
			ld("{broken") + ld('{"@context": "https://schema.org"}'),
		);
		expect(out.status).toBe("pass");
	});

	it("fails when JSON-LD does not parse", async () => {
		expect((await run(ld("{not json"))).status).toBe("fail");
	});

	it("fails when JSON-LD lacks schema.org context", async () => {
		expect((await run(ld('{"@context": "https://example.org"}'))).status).toBe(
			"fail",
		);
	});

	it("warns on microdata only", async () => {
		const out = await run(
			'<div itemscope itemtype="https://schema.org/Thing"></div>',
		);
		expect(out.status).toBe("warn");
	});

	it("fails when there is nothing", async () => {
		expect((await run("<p>hi</p>")).status).toBe("fail");
	});
});
