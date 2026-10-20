import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { renderHtml } from "../../src/reporters/html.ts";
import type { AuditResult, CategoryResult } from "../../src/types.ts";
import { HOMEPAGE } from "../../src/version.ts";

type CategoryOverrides = {
	title: string;
	id?: CategoryResult["id"];
	weight?: number;
	checks?: CategoryResult["checks"];
} & (
	| { status?: "scored"; score?: number }
	| { status: "skipped"; score: null; skipReason: string }
);

function category(overrides: CategoryOverrides): CategoryResult {
	const base = {
		id: overrides.id ?? ("ai-manifests" as const),
		weight: overrides.weight ?? 25,
		checks: [],
		title: overrides.title,
	};
	if (overrides.status === "skipped") {
		return {
			...base,
			checks: overrides.checks ?? [],
			status: "skipped",
			score: null,
			skipReason: overrides.skipReason,
		};
	}
	return {
		...base,
		checks: overrides.checks ?? [],
		status: "scored",
		score: overrides.score ?? 100,
	};
}

const result: AuditResult = {
	tool: { name: "agentcheck", version: "0.1.0" },
	target: "https://example.com/",
	finalUrl: "https://www.example.com/home",
	timestamp: "2026-10-18T00:00:00.000Z",
	categories: [
		category({
			title: "AI Manifests",
			score: 60,
			checks: [
				{
					id: "a",
					title: "A",
					weight: 1,
					status: "pass",
					message: "llms.txt found",
				},
				{
					id: "b",
					title: "B",
					weight: 1,
					status: "warn",
					message: "Heading skip detected",
					details: ["<script>alert(1)</script>"],
					remediation: 'Fix "it" & move on',
				},
				{
					id: "c",
					title: "C",
					weight: 1,
					status: "fail",
					message: "robots.txt blocks GPTBot",
				},
				{
					id: "d",
					title: "D",
					weight: 1,
					status: "skip",
					message: "Markdown twin not checked",
				},
			],
		}),
		category({
			id: "agentic-actionability",
			title: "Agentic Actionability",
			status: "skipped",
			score: null,
			skipReason: "Browser unavailable",
		}),
	],
	score: 72,
	grade: "C",
	browser: { used: true, engine: "chromium", version: "131", renderMs: 1900 },
};

describe("renderHtml", () => {
	it("is one self-contained document", () => {
		const html = renderHtml(result);
		expect(html.startsWith("<!doctype html>")).toBe(true);
		expect(html).toContain("<style>");
		expect(html).not.toMatch(/<script/i);
		expect(html).not.toMatch(/<link[^>]+href=/i);
		const urls = html.match(/https?:\/\/[^\s"'<)]+/g) ?? [];
		expect(new Set(urls)).toEqual(
			new Set([result.target, result.finalUrl, HOMEPAGE]),
		);
	});

	it("renders score, grade, every check and the skip reason", () => {
		const html = renderHtml(result);
		expect(html).toContain("72");
		expect(html).toContain(">C<");
		for (const check of result.categories.flatMap((c) => c.checks)) {
			expect(html).toContain(check.message);
		}
		expect(html).toContain("Browser unavailable");
		expect(html).toContain("chromium 131");
	});

	it("escapes site-controlled strings", () => {
		const html = renderHtml(result);
		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(html).toContain("Fix &quot;it&quot; &amp; move on");
	});

	it("parses with cheerio: one <details> per category, open when it has warn or fail", () => {
		const $ = cheerio.load(renderHtml(result));
		expect($("details").length).toBe(result.categories.length);
		expect($("details").first().attr("open")).toBeDefined();
		expect($("details").last().attr("open")).toBeUndefined();
	});

	it("marks each category with its identity colour, in both schemes", () => {
		const html = renderHtml(result);
		const $ = cheerio.load(html);
		for (const id of ["ai-manifests", "agentic-actionability"]) {
			expect($(`details[data-category="${id}"] summary .dot`).length).toBe(1);
		}
		for (const id of [
			"ai-manifests",
			"bot-access",
			"content-semantics",
			"agentic-actionability",
		]) {
			// One rule per scheme, so the dark theme gets its own step.
			expect(html.split(`[data-category="${id}"]{--cat:`).length - 1).toBe(2);
		}
	});

	it("supports both colour schemes", () => {
		expect(renderHtml(result)).toContain("prefers-color-scheme: dark");
	});
});
