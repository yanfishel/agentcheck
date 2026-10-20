import { describe, expect, it } from "vitest";
import { renderTerminal } from "../../src/reporters/terminal.ts";
import type { AuditResult, CategoryResult } from "../../src/types.ts";

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
	finalUrl: "https://example.com/",
	timestamp: "2026-10-18T00:00:00.000Z",
	categories: [
		category({
			title: "AI Manifests",
			score: 100,
			checks: [
				{
					id: "a",
					title: "A",
					weight: 1,
					status: "pass",
					message: "llms.txt found",
				},
			],
		}),
		category({
			id: "bot-access",
			title: "Bot Access",
			score: 89,
			checks: [
				{
					id: "b",
					title: "B",
					weight: 1,
					status: "warn",
					message: "ClaudeBot partially blocked",
					details: ["Disallow: /private"],
					remediation: "Allow ClaudeBot in robots.txt",
				},
				{
					id: "c",
					title: "C",
					weight: 1,
					status: "skip",
					message: "Not applicable",
				},
			],
		}),
		category({
			id: "content-semantics",
			title: "Content & Semantics",
			score: 49,
			checks: [
				{
					id: "d",
					title: "D",
					weight: 1,
					status: "fail",
					message: "No structured data",
					remediation: "Add JSON-LD",
				},
			],
		}),
		category({
			id: "agentic-actionability",
			title: "Agentic Actionability",
			status: "skipped",
			score: null,
			skipReason: "No checks available yet",
		}),
	],
	score: 92,
	grade: "A",
	browser: { used: false, reason: "No browser checks were run" },
};

describe("renderTerminal", () => {
	const lines = renderTerminal(result, { color: false }).split("\n");

	it("renders the header", () => {
		expect(lines).toContain(" AgentCheck v0.1.0 — AI-Readiness Audit");
		expect(lines).toContain(" Target: https://example.com/");
	});

	it("renders category markers and aligned scores", () => {
		expect(lines).toContain(" [✓] AI Manifests           100/100");
		expect(lines).toContain(" [!] Bot Access              89/100");
		expect(lines).toContain(" [✗] Content & Semantics     49/100");
		expect(lines).toContain(" [–] Agentic Actionability  skipped");
	});

	it("renders checks, details and remediation", () => {
		expect(lines).toContain("     ✓ llms.txt found");
		expect(lines).toContain("     ⚠ ClaudeBot partially blocked");
		expect(lines).toContain("       Disallow: /private");
		expect(lines).toContain("       → Allow ClaudeBot in robots.txt");
		expect(lines).toContain("     ✗ No structured data");
		expect(lines).toContain("       → Add JSON-LD");
		expect(lines).toContain("     – Not applicable");
	});

	it("renders the footer", () => {
		expect(lines).toContain(" OVERALL AI SCORE: 92 / 100 [A]");
		expect(lines).toContain(
			" Skipped: Agentic Actionability (No checks available yet)",
		);
	});

	it("omits the skipped line when nothing is skipped", () => {
		const out = renderTerminal(
			{ ...result, categories: [result.categories[0] as CategoryResult] },
			{ color: false },
		);
		expect(out).not.toContain("Skipped:");
		expect(out.endsWith("\n")).toBe(true);
	});

	it("uses ANSI codes only when color is enabled", () => {
		expect(renderTerminal(result, { color: true })).toContain("\u001b[");
		expect(renderTerminal(result, { color: false })).not.toContain("\u001b[");
	});
});

describe("renderTerminal browser line", () => {
	const used: AuditResult = {
		...result,
		browser: {
			used: true,
			engine: "chrome",
			version: "156.0.8078.4",
			renderMs: 4200,
		},
	};

	it("renders the Browser line right after Target", () => {
		const lines = renderTerminal(used, { color: false }).split("\n");
		const i = lines.indexOf(" Target: https://example.com/");
		expect(lines[i + 1]).toBe(
			" Browser: chrome 156.0.8078.4 (rendered in 4.2 s)",
		);
	});

	it("omits the Browser line when no browser was used", () => {
		expect(renderTerminal(result, { color: false })).not.toContain("Browser:");
	});
});
