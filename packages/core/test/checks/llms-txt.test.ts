import { describe, expect, it } from "vitest";
import { llmsTxt } from "../../src/checks/llms-txt.ts";
import { createAuditContext } from "../../src/context.ts";
import { createFetcher } from "../../src/http.ts";
import { mockRoutes, type Route } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const PAGE: Route = {
	status: 200,
	contentType: "text/html",
	body: "<html></html>",
};

const run = (route?: Route) =>
	runCheck(
		llmsTxt,
		mockRoutes("https://example.com", {
			"/": PAGE,
			...(route ? { "/llms.txt": route } : {}),
		}),
		"https://example.com/",
	);

describe("llms-txt", () => {
	it("has the expected metadata", () => {
		expect(llmsTxt.id).toBe("llms-txt");
		expect(llmsTxt.weight).toBe(40);
		expect(llmsTxt.category).toBe("ai-manifests");
	});

	it("passes for a plain-text file", async () => {
		const out = await run({
			status: 200,
			contentType: "text/plain; charset=utf-8",
			body: "# Site\n",
		});
		expect(out.status).toBe("pass");
	});

	it("fails on 404", async () => {
		const out = await run();
		expect(out.status).toBe("fail");
		expect(out.message).toContain("404");
	});

	it("does not say not found for a server error", async () => {
		const out = await run({
			status: 503,
			contentType: "text/plain",
			body: "x",
		});
		expect(out.status).toBe("fail");
		expect(out.message).toContain("returned HTTP 503");
		expect(out.message).not.toContain("not found");
	});

	it("says not found for 404 and 410", async () => {
		const out = await run({
			status: 410,
			contentType: "text/plain",
			body: "x",
		});
		expect(out.message).toContain("not found (HTTP 410)");
	});

	it("fails when served as text/html", async () => {
		const out = await run({
			status: 200,
			contentType: "text/html",
			body: "# Site",
		});
		expect(out.status).toBe("fail");
		expect(out.message).toContain("HTML");
	});

	it("fails when a text/plain body is an HTML document", async () => {
		const out = await run({
			status: 200,
			contentType: "text/plain",
			body: "<!DOCTYPE html><html></html>",
		});
		expect(out.status).toBe("fail");
		expect(out.message).toContain("HTML");
	});

	it("fails on an empty file", async () => {
		const out = await run({
			status: 200,
			contentType: "text/plain",
			body: "  \n",
		});
		expect(out.status).toBe("fail");
		expect(out.message).toContain("empty");
	});

	it("fails with the error text on timeout", async () => {
		const agent = mockRoutes("https://example.com", {
			"/": PAGE,
			"/llms.txt": {
				status: 200,
				contentType: "text/plain",
				body: "# Site",
				delayMs: 500,
			},
		});
		const fetcher = createFetcher({
			userAgent: "agentcheck-test",
			dispatcher: agent,
			timeoutMs: 50,
		});
		const ctx = await createAuditContext("https://example.com/", fetcher);
		const out = await llmsTxt.run(ctx);
		expect(out.status).toBe("fail");
		expect(out.message).toContain("timed out");
		expect(out.remediation).toBeTruthy();
	});
});
