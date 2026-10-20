import { describe, expect, it } from "vitest";
import { opengraph } from "../../src/checks/opengraph.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const run = (html: string) =>
	runCheck(
		opengraph,
		mockRoutes("https://example.com", {
			"/": { status: 200, contentType: "text/html", body: html },
		}),
		"https://example.com/",
	);

const og = (names: string[], attr = "property") =>
	names.map((n) => `<meta ${attr}="${n}" content="v">`).join("");
const ALL = ["og:title", "og:description", "og:image", "og:url"];

describe("opengraph", () => {
	it("has the expected metadata", () => {
		expect(opengraph.id).toBe("opengraph");
		expect(opengraph.weight).toBe(20);
		expect(opengraph.category).toBe("content-semantics");
	});

	it("passes with all four tags", async () => {
		expect((await run(og(ALL))).status).toBe("pass");
	});

	it("tolerates name= and mixed case", async () => {
		expect((await run(og(ALL, "name"))).status).toBe("pass");
		expect((await run(og(ALL.map((n) => n.toUpperCase())))).status).toBe(
			"pass",
		);
	});

	it("warns on missing og:image", async () => {
		const out = await run(og(["og:title", "og:description", "og:url"]));
		expect(out.status).toBe("warn");
		expect(out.details).toEqual(["og:image"]);
	});

	it("treats empty content as missing", async () => {
		const out = await run(
			og(["og:title", "og:description", "og:url"]) +
				'<meta property="og:image" content="  ">',
		);
		expect(out.status).toBe("warn");
		expect(out.details).toEqual(["og:image"]);
	});

	it("fails with no tags", async () => {
		expect((await run("<p>hi</p>")).status).toBe("fail");
	});
});
