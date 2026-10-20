import { describe, expect, it } from "vitest";
import { clickTargets } from "../../src/checks/click-targets.ts";
import { fakeRenderer, renderedPage } from "../helpers/fake-renderer.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const run = (traps: number, interactive: number) =>
	runCheck(
		clickTargets,
		mockRoutes("https://example.com", {
			"/": { status: 200, contentType: "text/html", body: "<body></body>" },
		}),
		"https://example.com/",
		fakeRenderer(
			renderedPage({
				clickTraps: Array.from({ length: traps }, (_, i) => ({
					element: `<div#d${i}>`,
				})),
				interactive: Array.from({ length: interactive }, (_, i) => ({
					role: "button",
					name: "x",
					element: `<button#b${i}>`,
				})),
			}),
		),
	);

describe("click-targets", () => {
	it("has the expected metadata", () => {
		expect(clickTargets.id).toBe("click-targets");
		expect(clickTargets.weight).toBe(25);
		expect(clickTargets.category).toBe("agentic-actionability");
	});

	it("passes with no traps", async () => {
		const out = await run(0, 10);
		expect(out.status).toBe("pass");
		expect(out.message).toBe("No click traps found");
	});

	it("passes with nothing at all", async () => {
		expect((await run(0, 0)).status).toBe("pass");
	});

	it("warns at 16%", async () => {
		const out = await run(22, 114);
		expect(out.status).toBe("warn");
		expect(out.message).toBe(
			"22 of 136 click targets are not buttons or links (16%)",
		);
		expect(out.remediation).toBe(
			'Use <button> or role="button" with tabindex="0" for clickable elements, not plain <div>/<span>.',
		);
	});

	it("fails at 30%", async () => {
		expect((await run(30, 70)).status).toBe("fail");
	});

	it("warns at exactly 25%", async () => {
		expect((await run(25, 75)).status).toBe("warn");
	});

	it("lists up to 5 details then a remainder", async () => {
		const out = await run(8, 100);
		expect(out.details).toHaveLength(6);
		expect(out.details?.[0]).toBe("<div#d0>");
		expect(out.details?.[5]).toBe("… and 3 more");
		expect((await run(5, 100)).details).toHaveLength(5);
	});

	it("skips when the browser is unavailable", async () => {
		const out = await runCheck(
			clickTargets,
			mockRoutes("https://example.com", {
				"/": { status: 200, contentType: "text/html", body: "<body></body>" },
			}),
			"https://example.com/",
			fakeRenderer({ kind: "unavailable", reason: "no browser" }),
		);
		expect(out).toEqual({ status: "skip", message: "no browser" });
	});
});

describe("click-targets failed collection", () => {
	const skipRun = (failures: { accessibility?: string; dom?: string }) =>
		runCheck(
			clickTargets,
			mockRoutes("https://example.com", {
				"/": { status: 200, contentType: "text/html", body: "<body></body>" },
			}),
			"https://example.com/",
			fakeRenderer(renderedPage({ failures })),
		);

	it("skips when the accessibility tree failed", async () => {
		const out = await skipRun({ accessibility: "ax boom", dom: "dom boom" });
		expect(out.status).toBe("skip");
		expect(out.message).toBe("Page measurements unavailable: ax boom");
	});

	it("skips when the DOM measurement failed", async () => {
		const out = await skipRun({ dom: "dom boom" });
		expect(out.status).toBe("skip");
		expect(out.message).toBe("Page measurements unavailable: dom boom");
	});
});
