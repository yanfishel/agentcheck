import { describe, expect, it } from "vitest";
import { createAuditContext, TargetUnreachableError } from "../src/context.ts";
import { createFetcher } from "../src/http.ts";
import { fakeRenderer, renderedPage } from "./helpers/fake-renderer.ts";
import { mockRoutes } from "./helpers/mock-site.ts";

const HTML = { status: 200, contentType: "text/html", body: "<html></html>" };

function fetcherFor(agent: ReturnType<typeof mockRoutes>) {
	return createFetcher({ userAgent: "test", dispatcher: agent });
}

describe("createAuditContext", () => {
	it("follows redirects and resolves paths against the final origin", async () => {
		const agent = mockRoutes("http://example.com", {
			"/": {
				status: 301,
				headers: { location: "https://www.example.com/" },
			},
		});
		mockRoutes(
			"https://www.example.com",
			{
				"/": HTML,
				"/robots.txt": {
					status: 200,
					contentType: "text/plain",
					body: "User-agent: *\nAllow: /",
				},
			},
			agent,
		);
		const ctx = await createAuditContext(
			"http://example.com/",
			fetcherFor(agent),
		);
		expect(ctx.targetUrl.origin).toBe("https://www.example.com");
		const res = await ctx.get("/robots.txt");
		expect(res.kind === "response" && res.url).toBe(
			"https://www.example.com/robots.txt",
		);
	});

	it("throws TargetUnreachableError on a non-2xx target", async () => {
		const agent = mockRoutes("https://example.com", { "/": { status: 500 } });
		await expect(
			createAuditContext("https://example.com/", fetcherFor(agent)),
		).rejects.toBeInstanceOf(TargetUnreachableError);
	});

	it("throws TargetUnreachableError on an invalid target", async () => {
		const agent = mockRoutes("https://example.com", { "/": HTML });
		await expect(
			createAuditContext("not a url", fetcherFor(agent)),
		).rejects.toBeInstanceOf(TargetUnreachableError);
	});

	it("parses the page", async () => {
		const agent = mockRoutes("https://example.com", {
			"/": { ...HTML, body: "<html><head><title>Hi</title></head></html>" },
		});
		const ctx = await createAuditContext(
			"https://example.com/",
			fetcherFor(agent),
		);
		expect(ctx.$("title").text()).toBe("Hi");
		expect(ctx.page.body).toContain("<title>");
	});

	it("reports a 404 robots.txt as missing", async () => {
		const agent = mockRoutes("https://example.com", { "/": HTML });
		const ctx = await createAuditContext(
			"https://example.com/",
			fetcherFor(agent),
		);
		expect((await ctx.robots()).kind).toBe("missing");
	});

	it("reports a 503 robots.txt as error", async () => {
		const agent = mockRoutes("https://example.com", {
			"/": HTML,
			"/robots.txt": { status: 503 },
		});
		const ctx = await createAuditContext(
			"https://example.com/",
			fetcherFor(agent),
		);
		expect((await ctx.robots()).kind).toBe("error");
	});

	it("parses robots.txt with BOM and CRLF", async () => {
		const agent = mockRoutes("https://example.com", {
			"/": HTML,
			"/robots.txt": {
				status: 200,
				contentType: "text/plain",
				body: "﻿user-agent: claudebot\r\ndisallow: /\r\n\r\nUser-agent: *\r\nDisallow: /admin\r\n",
			},
		});
		const ctx = await createAuditContext(
			"https://example.com/",
			fetcherFor(agent),
		);
		const robots = await ctx.robots();
		if (robots.kind !== "found") throw new Error("expected found");
		expect(robots.isAllowed("https://example.com/", "ClaudeBot")).toBe(false);
		expect(robots.isAllowed("https://example.com/", "GPTBot")).toBe(true);
		expect(robots.disallowedPaths("ClaudeBot")).toEqual(["/"]);
		expect(robots.disallowedPaths("GPTBot")).toEqual(["/admin"]);
	});

	it("memoizes robots()", async () => {
		const agent = mockRoutes("https://example.com", { "/": HTML });
		const ctx = await createAuditContext(
			"https://example.com/",
			fetcherFor(agent),
		);
		expect(ctx.robots()).toBe(ctx.robots());
	});

	it("defaults to a renderer that reports browser checks as not enabled", async () => {
		const agent = mockRoutes("https://example.com", { "/": HTML });
		const ctx = await createAuditContext(
			"https://example.com/",
			fetcherFor(agent),
		);
		expect(await ctx.rendered()).toEqual({
			kind: "unavailable",
			reason: "Browser checks not enabled",
		});
	});

	it("memoizes rendered() and renders the final URL", async () => {
		const agent = mockRoutes("http://example.com", {
			"/": { status: 301, headers: { location: "https://www.example.com/" } },
		});
		mockRoutes("https://www.example.com", { "/": HTML }, agent);
		const renderer = fakeRenderer(renderedPage());
		const ctx = await createAuditContext(
			"http://example.com/",
			fetcherFor(agent),
			renderer,
			"UA",
		);
		expect(ctx.renderStarted()).toBe(false);
		const first = await ctx.rendered();
		const second = await ctx.rendered();
		expect(ctx.renderStarted()).toBe(true);
		expect(first).toBe(second);
		expect(renderer.calls).toEqual([
			{ url: "https://www.example.com/", userAgent: "UA" },
		]);
	});

	it("passes browserUserAgent to the renderer", async () => {
		const agent = mockRoutes("https://example.com", { "/": HTML });
		const renderer = fakeRenderer(renderedPage());
		const ctx = await createAuditContext(
			"https://example.com/",
			fetcherFor(agent),
			renderer,
			"X/1",
		);
		await ctx.rendered();
		expect(renderer.calls[0]?.userAgent).toBe("X/1");
	});

	it("resolves to unavailable when the renderer throws", async () => {
		const agent = mockRoutes("https://example.com", { "/": HTML });
		const renderer = {
			async render(): Promise<never> {
				throw new Error("boom");
			},
		};
		const ctx = await createAuditContext(
			"https://example.com/",
			fetcherFor(agent),
			renderer,
		);
		const expected = {
			kind: "unavailable",
			reason: "Browser rendering failed: boom",
		};
		expect(await ctx.rendered()).toEqual(expected);
		expect(await ctx.rendered()).toEqual(expected);
	});
});
