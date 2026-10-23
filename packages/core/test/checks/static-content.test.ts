import { describe, expect, it } from "vitest";
import type { RenderOutcome } from "../../src/browser/types.ts";
import { tokenSavings } from "../../src/checks/markdown-twin.ts";
import { staticContent } from "../../src/checks/static-content.ts";
import { fakeRenderer, renderedPage } from "../helpers/fake-renderer.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const ORIGIN = "https://example.com";
const words = (n: number) =>
	Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const doc = (main: string) =>
	`<html><body><nav>${words(30)}</nav><main><p>${main}</p></main></body></html>`;

const run = (staticMain: string, outcome: RenderOutcome) =>
	runCheck(
		staticContent,
		mockRoutes(ORIGIN, {
			"/": { status: 200, contentType: "text/html", body: doc(staticMain) },
		}),
		`${ORIGIN}/`,
		fakeRenderer(outcome),
	);

describe("static-content", () => {
	it("has the expected metadata", () => {
		expect(staticContent.id).toBe("static-content");
		expect(staticContent.weight).toBe(15);
		expect(staticContent.category).toBe("content-semantics");
	});

	it("skips without a browser and without the rendered DOM", async () => {
		expect(
			(await run(words(10), { kind: "unavailable", reason: "No browser" }))
				.status,
		).toBe("skip");
		expect((await run(words(10), renderedPage())).status).toBe("skip");
	});

	it("passes when the static HTML has the rendered main text, nav aside", async () => {
		const out = await run(words(190), renderedPage({ html: doc(words(200)) }));
		expect(out.status).toBe("pass");
		expect(out.message).toBe(
			"The static HTML carries 95% of the rendered text (190 of 200 words)",
		);
	});

	it("warns from half to 80%, fails below half", async () => {
		expect(
			(await run(words(120), renderedPage({ html: doc(words(200)) }))).status,
		).toBe("warn");
		expect(
			(await run(words(20), renderedPage({ html: doc(words(200)) }))).status,
		).toBe("fail");
	});

	it("passes a page whose rendered text is small anyway", async () => {
		const out = await run("", renderedPage({ html: doc(words(20)) }));
		expect(out.status).toBe("pass");
	});
});

describe("tokenSavings", () => {
	it("says how much smaller the markdown is, or nothing", () => {
		expect(tokenSavings("x".repeat(48_400), "y".repeat(5_600))).toEqual([
			"Markdown is 88% smaller than the HTML (about 1.4k vs 12.1k tokens)",
		]);
		expect(tokenSavings("x".repeat(400), "y".repeat(40))).toEqual([
			"Markdown is 90% smaller than the HTML (about 10 vs 100 tokens)",
		]);
		expect(tokenSavings("short", "a much longer markdown")).toEqual([]);
	});
});
