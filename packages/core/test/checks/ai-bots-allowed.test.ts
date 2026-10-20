import { describe, expect, it } from "vitest";
import { AI_BOTS, aiBotsAllowed } from "../../src/checks/ai-bots-allowed.ts";
import { mockRoutes, type Route } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const PAGE: Route = {
	status: 200,
	contentType: "text/html",
	body: "<html></html>",
};

function site(robots: string | number | undefined, path = "/") {
	const routes: Record<string, Route> = { [path]: PAGE };
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

describe("ai-bots-allowed", () => {
	it("has the expected metadata", () => {
		expect(aiBotsAllowed.id).toBe("ai-bots-allowed");
		expect(aiBotsAllowed.weight).toBe(60);
		expect(aiBotsAllowed.category).toBe("bot-access");
	});

	it("passes when the path is allowed", async () => {
		const out = await runCheck(
			aiBotsAllowed,
			site("User-agent: *\nDisallow: /admin"),
			"https://example.com/",
		);
		expect(out.status).toBe("pass");
		expect(out.message).toBe(`robots.txt allows ${AI_BOTS.join(", ")}`);
	});

	it("passes when robots.txt is missing", async () => {
		const out = await runCheck(
			aiBotsAllowed,
			site(undefined),
			"https://example.com/",
		);
		expect(out.status).toBe("pass");
		expect(out.message).toMatch(/no robots\.txt/i);
	});

	it("warns when some bots are blocked", async () => {
		const out = await runCheck(
			aiBotsAllowed,
			site(
				"User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n",
			),
			"https://example.com/",
		);
		expect(out.status).toBe("warn");
		expect(out.details).toEqual(["GPTBot", "ClaudeBot"]);
	});

	it("fails when all bots are blocked", async () => {
		const out = await runCheck(
			aiBotsAllowed,
			site("User-agent: *\nDisallow: /"),
			"https://example.com/",
		);
		expect(out.status).toBe("fail");
		expect(out.details).toEqual([...AI_BOTS]);
	});

	it("warns when robots.txt cannot be fetched", async () => {
		const out = await runCheck(
			aiBotsAllowed,
			site(503),
			"https://example.com/",
		);
		expect(out.status).toBe("warn");
		expect(out.message).toContain("could not determine");
	});

	it("evaluates the audited path, not the root", async () => {
		const out = await runCheck(
			aiBotsAllowed,
			site("User-agent: *\nDisallow: /private", "/private/page?x=1"),
			"https://example.com/private/page?x=1",
		);
		expect(out.status).toBe("fail");
	});
});
