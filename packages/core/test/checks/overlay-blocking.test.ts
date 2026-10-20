import { describe, expect, it } from "vitest";
import { overlayBlocking } from "../../src/checks/overlay-blocking.ts";
import { fakeRenderer, renderedPage } from "../helpers/fake-renderer.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const routes = () =>
	mockRoutes("https://example.com", {
		"/": { status: 200, contentType: "text/html", body: "<body></body>" },
	});

const run = (
	overlays: { element: string; coverage: number; coversCentre: boolean }[],
) =>
	runCheck(
		overlayBlocking,
		routes(),
		"https://example.com/",
		fakeRenderer(renderedPage({ overlays })),
	);

describe("overlay-blocking", () => {
	it("has the expected metadata", () => {
		expect(overlayBlocking.id).toBe("overlay-blocking");
		expect(overlayBlocking.weight).toBe(20);
		expect(overlayBlocking.category).toBe("agentic-actionability");
	});

	it("passes with no overlays", async () => {
		const out = await run([]);
		expect(out.status).toBe("pass");
		expect(out.message).toBe("Nothing covers the page on load");
	});

	it("passes for a header and a corner widget", async () => {
		const out = await run([
			{ element: "<header>", coverage: 0.09, coversCentre: false },
			{ element: "<div.chat>", coverage: 0.17, coversCentre: false },
		]);
		expect(out.status).toBe("pass");
	});

	it("fails for a large bottom banner", async () => {
		const out = await run([
			{ element: "<div.cookie>", coverage: 0.4, coversCentre: false },
		]);
		expect(out.status).toBe("fail");
		expect(out.details).toEqual(["<div.cookie> covers 40% of the viewport"]);
		expect(out.remediation).toBe(
			"Do not cover the page with fixed banners or popups on load; let agents dismiss or bypass them.",
		);
	});

	it("fails when the centre is covered", async () => {
		const out = await run([
			{ element: "<div.modal>", coverage: 0.2, coversCentre: true },
		]);
		expect(out.status).toBe("fail");
	});

	it("passes at exactly 0.33 and fails at 0.34", async () => {
		expect(
			(await run([{ element: "<div>", coverage: 0.33, coversCentre: false }]))
				.status,
		).toBe("pass");
		expect(
			(await run([{ element: "<div>", coverage: 0.34, coversCentre: false }]))
				.status,
		).toBe("fail");
	});

	it("lists only blocking elements, up to 5 then a remainder", async () => {
		const overlays = Array.from({ length: 7 }, (_, i) => ({
			element: `<div#d${i}>`,
			coverage: 0.5,
			coversCentre: false,
		}));
		overlays.push({ element: "<header>", coverage: 0.1, coversCentre: false });
		const out = await run(overlays);
		expect(out.details).toHaveLength(6);
		expect(out.details?.[5]).toBe("… and 2 more");
		expect(out.details).not.toContain("<header> covers 10% of the viewport");
	});

	it("skips when the browser is unavailable", async () => {
		const out = await runCheck(
			overlayBlocking,
			routes(),
			"https://example.com/",
			fakeRenderer({ kind: "unavailable", reason: "no browser" }),
		);
		expect(out).toEqual({ status: "skip", message: "no browser" });
	});
});

describe("overlay-blocking failed collection", () => {
	const skipRun = (failures: { accessibility?: string; dom?: string }) =>
		runCheck(
			overlayBlocking,
			mockRoutes("https://example.com", {
				"/": { status: 200, contentType: "text/html", body: "<body></body>" },
			}),
			"https://example.com/",
			fakeRenderer(renderedPage({ failures })),
		);

	it("skips when the DOM measurement failed", async () => {
		const out = await skipRun({ dom: "dom boom" });
		expect(out.status).toBe("skip");
		expect(out.message).toBe("Page measurements unavailable: dom boom");
	});

	it("ignores an accessibility-only failure", async () => {
		expect((await skipRun({ accessibility: "ax boom" })).status).toBe("pass");
	});
});
