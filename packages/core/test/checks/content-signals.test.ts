import { describe, expect, it } from "vitest";
import {
	contentSignals,
	parseSignalValue,
	robotsContentSignals,
} from "../../src/checks/content-signals.ts";
import { mockRoutes, type Route } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const PAGE = "<html><head><title>x</title></head><body><p>x</p></body></html>";

function run(robots: Route | string | null, headers?: Record<string, string>) {
	const routes: Record<string, Route> = {
		"/": { status: 200, contentType: "text/html", body: PAGE, headers },
	};
	if (typeof robots === "string") {
		routes["/robots.txt"] = {
			status: 200,
			contentType: "text/plain",
			body: robots,
		};
	} else if (robots) routes["/robots.txt"] = robots;
	return runCheck(
		contentSignals,
		mockRoutes("https://example.com", routes),
		"https://example.com/",
	);
}

describe("content-signals", () => {
	it("has the expected metadata", () => {
		expect(contentSignals.id).toBe("content-signals");
		expect(contentSignals.weight).toBe(20);
		expect(contentSignals.category).toBe("bot-access");
	});

	it("passes for a signal in the User-agent: * group", async () => {
		const out = await run(
			"User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nDisallow: /admin\n",
		);
		expect(out.status).toBe("pass");
		expect(out.details).toEqual([
			"robots.txt (User-agent: *): search=yes, ai-input=yes, ai-train=no",
		]);
	});

	it("passes for a Content-Signal header without robots.txt", async () => {
		const out = await run(null, {
			"content-signal": "search=yes, ai-input=yes",
		});
		expect(out.status).toBe("pass");
		expect(out.details).toEqual([
			"Content-Signal header: search=yes, ai-input=yes",
		]);
	});

	it("fails when robots.txt has no signal", async () => {
		const out = await run("User-agent: *\nDisallow: /admin\n");
		expect(out.status).toBe("fail");
	});

	it("fails when there is no robots.txt and no header", async () => {
		const out = await run(null);
		expect(out.status).toBe("fail");
	});

	it("reads a signal in any group, as sites append it at the end", async () => {
		const out = await run(
			"User-agent: *\nAllow: /\n\nUser-agent: ExampleBot\nAllow: /\nContent-Signal: search=yes\n",
		);
		expect(out.status).toBe("pass");
		expect(out.details).toEqual([
			"robots.txt (User-agent: ExampleBot): search=yes",
		]);
	});

	it("reads a signal in an AI crawler's own group", async () => {
		const out = await run("User-agent: GPTBot\nContent-Signal: ai-input=yes\n");
		expect(out.status).toBe("pass");
	});

	it("warns when the signals opt out of search or AI input", async () => {
		const out = await run(
			"User-agent: *\nContent-Signal: search=yes, ai-input=no, ai-train=no\n",
		);
		expect(out.status).toBe("warn");
		expect(out.message).toBe("Content signals opt out of ai-input");
	});

	it("does not mind ai-train=no", async () => {
		const out = await run("User-agent: *\nContent-Signal: ai-train=no\n");
		expect(out.status).toBe("pass");
	});

	it("warns on a signal with no known key", async () => {
		const out = await run("User-agent: *\nContent-Signal: everything\n");
		expect(out.status).toBe("warn");
	});

	it("warns when robots.txt cannot be read and there is no header", async () => {
		const out = await run({ status: 503, contentType: "text/plain" });
		expect(out.status).toBe("warn");
		expect(out.message).toMatch(/robots\.txt unavailable/);
	});
});

describe("parseSignalValue", () => {
	it("reads known keys case-insensitively and drops the rest", () => {
		expect(
			parseSignalValue("Search=YES, ai-input = no, ai-train=maybe, foo=yes"),
		).toEqual({ search: "yes", "ai-input": "no" });
	});
});

describe("robotsContentSignals", () => {
	it("takes lines before the first group and strips comments", () => {
		expect(
			robotsContentSignals("Content-Signal: search=yes # ours\n").map(
				(l) => l.value,
			),
		).toEqual(["search=yes"]);
	});
});
