import { describe, expect, it } from "vitest";
import { headingHierarchy } from "../../src/checks/heading-hierarchy.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const run = (html: string) =>
	runCheck(
		headingHierarchy,
		mockRoutes("https://example.com", {
			"/": { status: 200, contentType: "text/html", body: html },
		}),
		"https://example.com/",
	);

const tags = (spec: string) =>
	spec
		.split(" ")
		.map((t) => `<${t}>Title ${t}</${t}>`)
		.join("");

describe("heading-hierarchy", () => {
	it("has the expected metadata", () => {
		expect(headingHierarchy.id).toBe("heading-hierarchy");
		expect(headingHierarchy.weight).toBe(25);
		expect(headingHierarchy.category).toBe("content-semantics");
	});

	it("passes and ignores headings before the first h1", async () => {
		expect((await run(tags("h2 h1 h2 h3 h2"))).status).toBe("pass");
	});

	it("does not treat stepping up as a skip", async () => {
		expect((await run(tags("h1 h2 h3 h4 h2"))).status).toBe("pass");
	});

	it("warns on a skipped level", async () => {
		const out = await run("<h1>A</h1><h2>B</h2><h4>Pricing details</h4>");
		expect(out.status).toBe("warn");
		expect(out.details).toEqual(['h2 → h4 ("Pricing details")']);
	});

	it("warns on multiple h1", async () => {
		const out = await run(tags("h1 h2 h1"));
		expect(out.status).toBe("warn");
		expect(out.details?.join(" ")).toContain("2");
	});

	it("reports both problems together", async () => {
		const out = await run(tags("h1 h3 h1"));
		expect(out.status).toBe("warn");
		expect(out.details).toHaveLength(2);
	});

	it("fails without an h1", async () => {
		expect((await run(tags("h4 h2 h3"))).status).toBe("fail");
	});

	it("fails without headings", async () => {
		expect((await run("<p>hi</p>")).status).toBe("fail");
	});
});
