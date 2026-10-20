import { describe, expect, it } from "vitest";
import { noaiDirectives } from "../../src/checks/noai-directives.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

function site(html: string, headers?: Record<string, string>) {
	return mockRoutes("https://example.com", {
		"/": { status: 200, contentType: "text/html", body: html, headers },
	});
}

const run = (html: string, headers?: Record<string, string>) =>
	runCheck(noaiDirectives, site(html, headers), "https://example.com/");

describe("noai-directives", () => {
	it("has the expected metadata", () => {
		expect(noaiDirectives.id).toBe("noai-directives");
		expect(noaiDirectives.weight).toBe(30);
		expect(noaiDirectives.category).toBe("bot-access");
	});

	it("passes when there are no directives", async () => {
		const out = await run("<html><head></head></html>");
		expect(out.status).toBe("pass");
	});

	it("passes for harmless robots meta", async () => {
		const out = await run(
			'<meta name="robots" content="index, follow"><p>x</p>',
		);
		expect(out.status).toBe("pass");
	});

	it("fails on noai in robots meta", async () => {
		const out = await run('<meta name="robots" content="index, noai">');
		expect(out.status).toBe("fail");
		expect(out.details).toEqual(["noai"]);
	});

	it("warns on noimageai only", async () => {
		const out = await run('<meta name="robots" content="noimageai">');
		expect(out.status).toBe("warn");
		expect(out.details).toEqual(["noimageai"]);
	});

	it("fails on noai in the X-Robots-Tag header", async () => {
		const out = await run("<html></html>", { "x-robots-tag": "noai" });
		expect(out.status).toBe("fail");
	});

	it("is case-insensitive", async () => {
		const out = await run('<META NAME="Robots" CONTENT="NOAI">');
		expect(out.status).toBe("fail");
	});

	it("counts a bot-prefixed header value", async () => {
		const out = await run("<html></html>", {
			"x-robots-tag": "GPTBot: noai, noimageai",
		});
		expect(out.status).toBe("fail");
		expect(out.details).toEqual(["noai", "noimageai"]);
	});
});
