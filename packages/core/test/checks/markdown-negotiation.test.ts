import { describe, expect, it } from "vitest";
import { markdownNegotiation } from "../../src/checks/markdown-negotiation.ts";
import { mockRoutes, type Route } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const ORIGIN = "https://example.com";
const PAGE: Route = {
	status: 200,
	contentType: "text/html",
	body: "<html><head></head><body><p>Hi</p></body></html>",
};
const MARKDOWN: Route = {
	status: 200,
	contentType: "text/markdown; charset=utf-8",
	body: "# Hi\n",
};

const run = (route: Route) =>
	runCheck(
		markdownNegotiation,
		mockRoutes(ORIGIN, { "/": route }),
		`${ORIGIN}/`,
	);

describe("markdown-negotiation", () => {
	it("has the expected metadata", () => {
		expect(markdownNegotiation.id).toBe("markdown-negotiation");
		expect(markdownNegotiation.weight).toBe(10);
		expect(markdownNegotiation.category).toBe("ai-manifests");
	});

	it("passes when Accept: text/markdown gets markdown", async () => {
		const seen: string[] = [];
		const out = await run({
			...PAGE,
			markdown: {
				...MARKDOWN,
				onRequest: (headers) => seen.push(headers.accept ?? ""),
			},
		});
		expect(out.status).toBe("pass");
		expect(seen).toEqual(["text/markdown"]);
	});

	it("fails when the page answers with HTML", async () => {
		const out = await run(PAGE);
		expect(out.status).toBe("fail");
		expect(out.message).toBe(
			"The page does not answer Accept: text/markdown with markdown (answered with text/html)",
		);
	});

	it("fails on text/markdown that carries HTML", async () => {
		const out = await run({
			...PAGE,
			markdown: { ...MARKDOWN, body: "<!doctype html><html></html>" },
		});
		expect(out.status).toBe("fail");
		expect(out.message).toContain("with HTML or nothing");
	});

	it("fails on a non-200 answer", async () => {
		const out = await run({ ...PAGE, markdown: { status: 406 } });
		expect(out.status).toBe("fail");
		expect(out.message).toContain("(HTTP 406)");
	});
});
