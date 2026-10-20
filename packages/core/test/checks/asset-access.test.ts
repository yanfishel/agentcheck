import { describe, expect, it } from "vitest";
import { assetAccess } from "../../src/checks/asset-access.ts";
import { mockRoutes, type Route } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const HTML = `<html><head><link rel="stylesheet" href="/css/s.css"></head>
<body><img src="/images/a.png"><script src="/javascript/app.js"></script>
<img src="data:image/png;base64,AAAA"><img src="//cdn.other.com/images/x.png">
<img src="https://other.com/images/y.png"></body></html>`;

function site(robots: string | number | undefined) {
	const routes: Record<string, Route> = {
		"/": { status: 200, contentType: "text/html", body: HTML },
	};
	if (typeof robots === "string") {
		routes["/robots.txt"] = {
			status: 200,
			contentType: "text/plain",
			body: robots,
		};
	} else if (typeof robots === "number") {
		routes["/robots.txt"] = { status: robots };
	}
	return mockRoutes("https://example.com", routes);
}

const run = (robots: string | number | undefined) =>
	runCheck(assetAccess, site(robots), "https://example.com/");

describe("asset-access", () => {
	it("has the expected metadata", () => {
		expect(assetAccess.id).toBe("asset-access");
		expect(assetAccess.weight).toBe(10);
		expect(assetAccess.category).toBe("bot-access");
	});

	it("warns and lists blocking rules", async () => {
		const out = await run(
			"User-agent: *\nDisallow: /javascript/\nDisallow: /images/\n",
		);
		expect(out.status).toBe("warn");
		expect(out.message).toBe("robots.txt blocks 2 of 3 page assets");
		expect(out.details).toEqual(["/javascript/", "/images/"]);
	});

	it("passes when only unrelated paths are disallowed", async () => {
		const out = await run("User-agent: *\nDisallow: /admin");
		expect(out.status).toBe("pass");
	});

	it("passes when robots.txt is missing", async () => {
		expect((await run(undefined)).status).toBe("pass");
	});

	it("skips when robots.txt cannot be read", async () => {
		const out = await run(503);
		expect(out.status).toBe("skip");
		expect(out.message).toBe(
			"robots.txt could not be read; asset access not evaluated",
		);
	});

	it("honors wildcard rules", async () => {
		const out = await run("User-agent: *\nDisallow: /*.css$\n");
		expect(out.status).toBe("warn");
		expect(out.details).toEqual(["/*.css$"]);
	});
});
