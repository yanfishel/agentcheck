import { describe, expect, it } from "vitest";
import { markdownTwin } from "../../src/checks/markdown-twin.ts";
import { mockRoutes, type Route } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const ORIGIN = "https://example.com";
const TEXT: Route = {
	status: 200,
	contentType: "text/plain; charset=utf-8",
	body: "# Page\n\nHello.",
};

const page = (head = ""): Route => ({
	status: 200,
	contentType: "text/html",
	body: `<html><head>${head}</head><body></body></html>`,
});

const alt = (href: string, type = "text/markdown", rel = "alternate") =>
	`<link rel="${rel}" type="${type}" href="${href}">`;

const run = (routes: Record<string, Route>, target = `${ORIGIN}/`) =>
	runCheck(markdownTwin, mockRoutes(ORIGIN, routes), target);

describe("markdown-twin", () => {
	it("has the expected metadata", () => {
		expect(markdownTwin.id).toBe("markdown-twin");
		expect(markdownTwin.weight).toBe(20);
		expect(markdownTwin.category).toBe("ai-manifests");
	});

	it("passes via an alternate link and names the URL", async () => {
		const out = await run({
			"/": page(alt("/llms.txt")),
			"/llms.txt": TEXT,
		});
		expect(out.status).toBe("pass");
		expect(out.message).toContain("https://example.com/llms.txt");
	});

	it("passes via /index.md when there is no link", async () => {
		const out = await run({ "/": page(), "/index.md": TEXT });
		expect(out.status).toBe("pass");
		expect(out.message).toContain("https://example.com/index.md");
	});

	it("requests <pathname>.md and drops the query", async () => {
		const hits: string[] = [];
		const out = await run(
			{
				"/docs/page?x=1": page(),
				"/docs/page.md": { ...TEXT, onRequest: () => hits.push("md") },
			},
			`${ORIGIN}/docs/page?x=1`,
		);
		expect(out.status).toBe("pass");
		expect(hits).toEqual(["md"]);
	});

	it("maps a trailing-slash path to <dir>.md", async () => {
		const out = await run(
			{ "/docs/": page(), "/docs.md": TEXT },
			`${ORIGIN}/docs/`,
		);
		expect(out.status).toBe("pass");
		expect(out.message).toContain("https://example.com/docs.md");
	});

	it("matches rel tokens and type parameters case-insensitively", async () => {
		const out = await run({
			"/": page(
				alt("/twin.md", "Text/Markdown; charset=utf-8", "Alternate nofollow"),
			),
			"/twin.md": TEXT,
		});
		expect(out.status).toBe("pass");
		expect(out.message).toContain("/twin.md");
	});

	it("skips a cross-origin alternate", async () => {
		const out = await run({
			"/": page(alt("https://other.example/page.md")),
		});
		expect(out.status).toBe("fail");
		expect(out.details?.join("\n")).not.toContain("other.example");
	});

	it("falls back to .md when the linked file is missing", async () => {
		const out = await run({
			"/": page(alt("/missing.md")),
			"/index.md": TEXT,
		});
		expect(out.status).toBe("pass");
		expect(out.message).toContain("/index.md");
	});

	it("fails when the link is 404 and there is no .md", async () => {
		const out = await run({ "/": page(alt("/missing.md")) });
		expect(out.status).toBe("fail");
		expect(out.message).toBe("No markdown version of this page found");
		expect(out.details?.join("\n")).toContain("/missing.md");
		expect(out.details?.join("\n")).toContain("HTTP 404");
	});

	it("fails when a candidate is served as HTML", async () => {
		const out = await run({
			"/": page(),
			"/index.md": {
				status: 200,
				contentType: "text/html",
				body: "<html></html>",
			},
		});
		expect(out.status).toBe("fail");
		expect(out.details?.join("\n")).toContain("served as HTML");
	});

	it("fails when nothing exists", async () => {
		const out = await run({ "/": page() });
		expect(out.status).toBe("fail");
		expect(out.remediation).toBeTruthy();
	});
});
