import { describe, expect, it } from "vitest";
import { llmsTxtLink } from "../../src/checks/llms-txt-link.ts";
import { mockRoutes, type Route } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const ORIGIN = "https://example.com";
const LLMS: Route = {
	status: 200,
	contentType: "text/plain",
	body: "# Example\n\n> A site.\n",
};

const page = (head: string, headers?: Record<string, string>): Route => ({
	status: 200,
	contentType: "text/html",
	body: `<html><head>${head}</head><body></body></html>`,
	headers,
});

const run = (routes: Record<string, Route>) =>
	runCheck(llmsTxtLink, mockRoutes(ORIGIN, routes), `${ORIGIN}/`);

describe("llms-txt-link", () => {
	it("has the expected metadata", () => {
		expect(llmsTxtLink.id).toBe("llms-txt-link");
		expect(llmsTxtLink.weight).toBe(10);
		expect(llmsTxtLink.category).toBe("ai-manifests");
	});

	it('passes for <link rel="describedby" href="/llms.txt">', async () => {
		const out = await run({
			"/": page('<link rel="describedby" href="/llms.txt">'),
			"/llms.txt": LLMS,
		});
		expect(out.status).toBe("pass");
		expect(out.message).toContain("link tag");
	});

	it("passes for a Link header with an absolute URL", async () => {
		const out = await run({
			"/": page("", {
				link: '<https://example.com/llms.txt>; rel="describedby"',
			}),
			"/llms.txt": LLMS,
		});
		expect(out.status).toBe("pass");
		expect(out.message).toContain("Link header");
	});

	it("fails when the page does not link to llms.txt", async () => {
		const out = await run({
			"/": page('<link rel="alternate" type="text/markdown" href="/llms.txt">'),
			"/llms.txt": LLMS,
		});
		expect(out.status).toBe("fail");
	});

	it("does not count another site's llms.txt", async () => {
		const out = await run({
			"/": page(
				'<link rel="describedby" href="https://other.example/llms.txt">',
			),
			"/llms.txt": LLMS,
		});
		expect(out.status).toBe("fail");
	});

	it("skips when the site has no llms.txt", async () => {
		const out = await run({
			"/": page('<link rel="describedby" href="/llms.txt">'),
		});
		expect(out.status).toBe("skip");
	});
});
