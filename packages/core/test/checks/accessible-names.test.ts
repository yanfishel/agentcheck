import { describe, expect, it } from "vitest";
import { accessibleNames } from "../../src/checks/accessible-names.ts";
import { fakeRenderer, renderedPage } from "../helpers/fake-renderer.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const node = (i: number, name: string) => ({
	role: "button",
	name,
	element: `<button#b${i}>`,
});

const nodes = (named: number, unnamed: number) => [
	...Array.from({ length: named }, (_, i) => node(i, "Go")),
	...Array.from({ length: unnamed }, (_, i) => node(1000 + i, " ")),
];

const run = (interactive: ReturnType<typeof nodes>) =>
	runCheck(
		accessibleNames,
		mockRoutes("https://example.com", {
			"/": { status: 200, contentType: "text/html", body: "<body></body>" },
		}),
		"https://example.com/",
		fakeRenderer(renderedPage({ interactive })),
	);

describe("accessible-names", () => {
	it("has the expected metadata", () => {
		expect(accessibleNames.id).toBe("accessible-names");
		expect(accessibleNames.weight).toBe(40);
		expect(accessibleNames.category).toBe("agentic-actionability");
	});

	it("passes when all are named", async () => {
		const out = await run(nodes(10, 0));
		expect(out.status).toBe("pass");
		expect(out.message).toBe(
			"All 10 interactive elements have accessible names",
		);
	});

	it("passes with no interactive elements", async () => {
		const out = await run([]);
		expect(out.status).toBe("pass");
		expect(out.message).toBe("No interactive elements found");
	});

	it("warns at 5%", async () => {
		expect((await run(nodes(19, 1))).status).toBe("warn");
	});

	it("warns at exactly 10%", async () => {
		expect((await run(nodes(9, 1))).status).toBe("warn");
	});

	it("fails at 20%", async () => {
		const out = await run(nodes(8, 2));
		expect(out.status).toBe("fail");
		expect(out.remediation).toBe(
			"Give icon-only links and buttons an accessible name (aria-label or visually hidden text).",
		);
	});

	it("reports counts and rounded percentage", async () => {
		const out = await run(nodes(47, 8));
		expect(out.message).toBe(
			"8 of 55 interactive elements have no accessible name (15%)",
		);
	});

	it("lists up to 5 details then a remainder", async () => {
		const out = await run(nodes(0, 8));
		expect(out.details).toHaveLength(6);
		expect(out.details?.[0]).toBe("button: <button#b1000>");
		expect(out.details?.[5]).toBe("… and 3 more");
		const few = await run(nodes(20, 5));
		expect(few.details).toHaveLength(5);
	});

	it("skips when the browser is unavailable", async () => {
		const out = await runCheck(
			accessibleNames,
			mockRoutes("https://example.com", {
				"/": { status: 200, contentType: "text/html", body: "<body></body>" },
			}),
			"https://example.com/",
			fakeRenderer({ kind: "unavailable", reason: "no browser" }),
		);
		expect(out).toEqual({ status: "skip", message: "no browser" });
	});
});

describe("accessible-names failed collection", () => {
	const skipRun = (failures: { accessibility?: string; dom?: string }) =>
		runCheck(
			accessibleNames,
			mockRoutes("https://example.com", {
				"/": { status: 200, contentType: "text/html", body: "<body></body>" },
			}),
			"https://example.com/",
			fakeRenderer(renderedPage({ failures })),
		);

	it("skips when the accessibility tree failed", async () => {
		const out = await skipRun({ accessibility: "ax boom" });
		expect(out.status).toBe("skip");
		expect(out.message).toBe("Accessibility tree unavailable: ax boom");
	});

	it("ignores a DOM-only failure", async () => {
		expect((await skipRun({ dom: "dom boom" })).status).toBe("pass");
	});
});
