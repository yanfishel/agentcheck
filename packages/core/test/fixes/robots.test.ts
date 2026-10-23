import robotsParserModule from "robots-parser";
import { describe, expect, it } from "vitest";
import { AI_BOTS, aiBotsAllowed } from "../../src/checks/ai-bots-allowed.ts";
import { rewriteRobots } from "../../src/fixes/robots.ts";
import { mockRoutes, runCheck } from "../helpers/index.ts";

type RobotsParser = typeof import("robots-parser").default;
const robotsParser = robotsParserModule as unknown as RobotsParser;

const ROBOTS_URL = "https://site.test/robots.txt";
const OPTS = { toolVersion: "1.2.3" };
const ROOT = new URL("https://site.test/");
const DOCS = new URL("https://site.test/docs/page?x=1");

function allowed(body: string, path: string, agent: string): boolean {
	return (
		robotsParser(ROBOTS_URL, body).isAllowed(new URL(path, ROOT).href, agent) ??
		true
	);
}

interface Case {
	name: string;
	original: string;
	audited: URL;
	/** [bot or "AI" for every AI crawler, path] that must stay blocked. */
	stillBlocked: [string, string][];
}

const CASES: Case[] = [
	{
		name: "star blocks everything",
		original: "User-agent: *\nDisallow: /\n",
		audited: ROOT,
		stillBlocked: [],
	},
	{
		name: "star blocks paths, GPTBot blocked entirely",
		original:
			"User-agent: *\nDisallow: /admin\nDisallow: /cart\n\nUser-agent: GPTBot\nDisallow: /\n",
		audited: ROOT,
		stillBlocked: [
			["AI", "/admin"],
			["AI", "/cart"],
		],
	},
	{
		name: "shared group with Bingbot",
		original:
			"User-agent: GPTBot\nUser-agent: Bingbot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n",
		audited: ROOT,
		stillBlocked: [["AI", "/admin"]],
	},
	{
		name: "every AI bot in one group, wildcard rule on docs",
		original: `${AI_BOTS.map((b) => `User-agent: ${b}`).join("\n")}\nDisallow: /docs/*page\nDisallow: /private\nCrawl-delay: 5\n\nUser-agent: *\nDisallow: /cart$\nAllow: /\n`,
		audited: DOCS,
		stillBlocked: [["AI", "/private"]],
	},
	{
		name: "star group with an allow and a deeper block, audited under docs",
		original:
			"User-agent: *\nDisallow: /docs\nAllow: /docs/public\nDisallow: /admin\n\nUser-agent: Googlebot\nDisallow: /cart\n",
		audited: DOCS,
		stillBlocked: [["AI", "/admin"]],
	},
	{
		name: "own group split across two blocks with comments",
		original:
			"# robots\nUser-agent: ClaudeBot # anthropic\nDisallow: / # all\n\nUser-agent: *\nDisallow: /admin\n\nUser-agent: claudebot/1.0\nDisallow: /private\n",
		audited: ROOT,
		stillBlocked: [
			["AI", "/admin"],
			["ClaudeBot", "/private"],
		],
	},
	{
		name: "nothing blocked",
		original: "User-agent: *\nDisallow: /admin\n",
		audited: ROOT,
		stillBlocked: [["AI", "/admin"]],
	},
	{
		name: "orphan rules before the first group",
		original: "Disallow: /orphan\n\nUser-agent: *\nDisallow: /\n",
		audited: ROOT,
		stillBlocked: [],
	},
];

const OTHER_AGENTS = ["Googlebot", "*", "Bingbot"];

function pathsFor(c: Case): string[] {
	return ["/", "/admin", "/cart", "/private", "/orphan", c.audited.pathname];
}

describe("rewriteRobots", () => {
	for (const c of CASES) {
		describe(c.name, () => {
			const out = rewriteRobots(c.original, c.audited, OPTS);

			it("unblocks the audited path for every blocked AI crawler", () => {
				for (const bot of AI_BOTS) {
					expect(allowed(out.content, c.audited.href, bot), bot).toBe(true);
				}
			});

			it("reports exactly the bots that were blocked", () => {
				const blocked = AI_BOTS.filter(
					(bot) => !allowed(c.original, c.audited.href, bot),
				);
				expect(out.blockedBots).toEqual(blocked);
			});

			it("never changes the answers for other agents", () => {
				for (const agent of OTHER_AGENTS) {
					for (const path of pathsFor(c)) {
						expect(allowed(out.content, path, agent), `${agent} ${path}`).toBe(
							allowed(c.original, path, agent),
						);
					}
				}
			});

			it("keeps star-blocked paths blocked for AI crawlers", () => {
				for (const [who, path] of c.stillBlocked) {
					const bots = who === "AI" ? AI_BOTS : [who];
					for (const bot of bots) {
						expect(
							allowed(c.original, path, bot),
							`before: ${bot} ${path}`,
						).toBe(false);
						expect(allowed(out.content, path, bot), `${bot} ${path}`).toBe(
							false,
						);
					}
				}
			});

			it("leaves bots that were not blocked unchanged", () => {
				for (const bot of AI_BOTS) {
					if (out.blockedBots.includes(bot)) continue;
					for (const path of pathsFor(c)) {
						expect(allowed(out.content, path, bot), `${bot} ${path}`).toBe(
							allowed(c.original, path, bot),
						);
					}
				}
			});
		});
	}

	it("keeps star-blocked paths blocked for an AI crawler with its own group", () => {
		const out = rewriteRobots(
			"User-agent: *\nDisallow: /admin\nDisallow: /cart\n\nUser-agent: GPTBot\nDisallow: /\n",
			ROOT,
			OPTS,
		);
		expect(allowed(out.content, "/", "GPTBot")).toBe(true);
		expect(allowed(out.content, "/admin", "GPTBot")).toBe(false);
		expect(allowed(out.content, "/cart", "GPTBot")).toBe(false);
		expect(out.blockedBots).toEqual(["GPTBot"]);
	});

	it("takes AI crawlers out of a shared group", () => {
		const out = rewriteRobots(
			"User-agent: GPTBot\nUser-agent: Bingbot\nDisallow: /\n",
			ROOT,
			OPTS,
		);
		expect(allowed(out.content, "/", "Bingbot")).toBe(false);
		expect(allowed(out.content, "/", "GPTBot")).toBe(true);
		expect(out.blockedBots).toEqual(["GPTBot"]);
	});

	it("drops only the Disallow lines that cover the audited URL from an existing AI group", () => {
		const out = rewriteRobots(
			"User-agent: ClaudeBot\nDisallow: /\nDisallow: /private\n",
			ROOT,
			OPTS,
		);
		expect(allowed(out.content, "/", "ClaudeBot")).toBe(true);
		expect(allowed(out.content, "/private", "ClaudeBot")).toBe(false);
		expect(allowed(out.content, "/private", "Googlebot")).toBe(true);
	});

	it("does not attach orphan rules to the new groups", () => {
		const out = rewriteRobots(
			"Disallow: /orphan\n\nUser-agent: *\nDisallow: /\n",
			ROOT,
			OPTS,
		);
		for (const bot of AI_BOTS) {
			expect(allowed(out.content, "/orphan", bot), bot).toBe(true);
		}
	});

	it("keeps comments, Sitemap and unknown lines", () => {
		const original = [
			"# Our robots file",
			"User-agent: *",
			"Disallow: /",
			"Crawl-delay: 10",
			"Clean-param: ref /articles/",
			"",
			"Sitemap: https://site.test/sitemap.xml",
			"Host: site.test",
		].join("\n");
		const out = rewriteRobots(original, ROOT, OPTS);
		for (const line of original.split("\n").filter(Boolean)) {
			expect(out.content.split("\n")).toContain(line);
		}
	});

	it("marks every added line", () => {
		const out = rewriteRobots(
			"User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nUser-agent: Bingbot\nDisallow: /\n",
			ROOT,
			OPTS,
		);
		const lines = out.content.split("\n");
		expect(lines).toContain("User-agent: GPTBot # AgentCheck: allow GPTBot");
		expect(lines).toContain("Allow: / # AgentCheck: allow GPTBot");
		expect(lines).toContain("# User-agent: GPTBot # AgentCheck: allow GPTBot");
	});

	it("writes the header lines", () => {
		const out = rewriteRobots("User-agent: *\nDisallow: /\n", ROOT, OPTS);
		const lines = out.content.split("\n");
		expect(lines[0]).toBe(
			"# Generated by AgentCheck 1.2.3 from https://site.test/robots.txt",
		);
		expect(lines[1]?.startsWith("# Changed: ")).toBe(true);
		expect(out.changed.length).toBeGreaterThan(0);
		expect(out.content.endsWith("\n")).toBe(true);
	});

	it("keeps the file as it is when no AI crawler is blocked", () => {
		const original =
			"User-agent: *\nContent-Signal: search=yes, ai-input=yes\nDisallow: /admin\n";
		const out = rewriteRobots(original, ROOT, OPTS);
		expect(out.changed).toEqual([]);
		expect(out.blockedBots).toEqual([]);
		expect(out.addedSignal).toBe(false);
		expect(out.content.endsWith(original)).toBe(true);
	});

	it("adds the default content signal at the end of the * group", () => {
		const out = rewriteRobots(
			"User-agent: *\nUser-agent: Twitterbot\nDisallow: /admin\n\nUser-agent: Bingbot\nDisallow: /x\n",
			ROOT,
			OPTS,
		);
		expect(out.addedSignal).toBe(true);
		expect(out.changed).toEqual([
			"declare Content-Signal: search=yes, ai-input=yes, ai-train=no",
		]);
		expect(out.content).toContain(
			"User-agent: *\nUser-agent: Twitterbot\nDisallow: /admin\nContent-Signal: search=yes, ai-input=yes, ai-train=no # AgentCheck: declare content signals\n\nUser-agent: Bingbot\nDisallow: /x\n",
		);
	});

	it("adds a * group for the signal when the file has none", () => {
		const out = rewriteRobots(
			"User-agent: Bingbot\nDisallow: /x\n",
			ROOT,
			OPTS,
		);
		expect(
			out.content.endsWith(
				"Disallow: /x\n\nUser-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no # AgentCheck: declare content signals\n",
			),
		).toBe(true);
	});

	it("puts the signal before a Sitemap line that follows the * group", () => {
		const out = rewriteRobots(
			"User-agent: *\nDisallow: /admin\n\nSitemap: https://site.test/sitemap.xml\n",
			ROOT,
			OPTS,
		);
		expect(out.content).toContain(
			"Disallow: /admin\nContent-Signal: search=yes, ai-input=yes, ai-train=no # AgentCheck: declare content signals\n\nSitemap: https://site.test/sitemap.xml\n",
		);
	});

	it("repeats the * group's signal in a new group for an unblocked crawler", () => {
		const out = rewriteRobots(
			"User-agent: *\nContent-Signal: search=yes, ai-input=yes\nDisallow: /\n",
			ROOT,
			OPTS,
		);
		expect(out.addedSignal).toBe(false);
		expect(out.content).toContain(
			"User-agent: GPTBot # AgentCheck: allow GPTBot\nAllow: / # AgentCheck: allow GPTBot\nContent-Signal: search=yes, ai-input=yes # AgentCheck: allow GPTBot\n",
		);
	});

	it("strips a byte order mark and normalises line endings", () => {
		const out = rewriteRobots("﻿User-agent: *\r\nDisallow: /\r\n", ROOT, OPTS);
		expect(out.content).not.toContain("\r");
		expect(out.content).not.toContain("﻿");
		expect(out.content.split("\n")).toContain("User-agent: *");
	});

	it("writes a minimal file when the site has none", () => {
		const out = rewriteRobots(null, ROOT, {
			...OPTS,
			sitemap: "https://site.test/sitemap.xml",
		});
		const lines = out.content.split("\n");
		expect(lines[0]?.startsWith("# Generated by AgentCheck 1.2.3")).toBe(true);
		expect(lines).toContain("User-agent: *");
		expect(lines).toContain("Allow: /");
		expect(lines).toContain("Sitemap: https://site.test/sitemap.xml");
		expect(out.blockedBots).toEqual([]);
		expect(out.changed.length).toBeGreaterThan(0);
	});

	it("writes no Sitemap line in a minimal file without a sitemap", () => {
		const out = rewriteRobots(null, ROOT, OPTS);
		expect(out.content).not.toContain("Sitemap:");
	});

	it("passes the ai-bots-allowed check", async () => {
		for (const c of CASES) {
			const { content } = rewriteRobots(c.original, c.audited, OPTS);
			const agent = mockRoutes("https://site.test", {
				[c.audited.pathname + c.audited.search]: {
					status: 200,
					contentType: "text/html",
					body: "<html></html>",
				},
				"/robots.txt": {
					status: 200,
					contentType: "text/plain",
					body: content,
				},
			});
			const outcome = await runCheck(aiBotsAllowed, agent, c.audited.href);
			expect(outcome.status, c.name).toBe("pass");
		}
	});
});
