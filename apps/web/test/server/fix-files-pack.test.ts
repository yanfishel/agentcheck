import type { AuditResult } from "@agentcheck/core";
import { type FixFile, type FixFiles, readme } from "@agentcheck/core/fixes";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { fixZip } from "@/server/fix-files-pack";

const result = {
	tool: { name: "agentcheck", version: "0.1.0" },
	target: "https://codeframe.pro/",
	finalUrl: "https://codeframe.pro/",
	timestamp: "2026-10-20T00:00:00.000Z",
	categories: [
		{
			id: "bot-access",
			title: "Bot Access",
			weight: 20,
			status: "scored",
			score: 40,
			checks: [
				{
					id: "ai-bots-allowed",
					title: "AI bots allowed",
					weight: 1,
					status: "fail",
					message: "GPTBot is blocked in robots.txt",
				},
			],
		},
		{
			id: "ai-manifests",
			title: "AI Manifests",
			weight: 30,
			status: "scored",
			score: 0,
			checks: [
				{
					id: "llms-txt",
					title: "llms.txt",
					weight: 1,
					status: "fail",
					message: "No /llms.txt found",
				},
				{
					id: "llms-txt-format",
					title: "llms.txt format",
					weight: 1,
					status: "pass",
					message: "fine",
				},
			],
		},
	],
	score: 40,
	grade: "D",
	browser: { used: false, reason: "disabled" },
} as unknown as AuditResult;

const NL = String.fromCharCode(10);
const ROBOTS_CONTENT = ["User-agent: GPTBot", "Allow: /", ""].join(NL);

const robotsFile: FixFile = {
	kind: "robots",
	name: "robots.txt",
	target: "Replace /robots.txt at the site root",
	fixes: ["ai-bots-allowed"],
	content: ROBOTS_CONTENT,
	todos: [],
};
const llmsFile: FixFile = {
	kind: "llms",
	name: "llms.txt",
	target: "New file at /llms.txt",
	fixes: ["llms-txt", "llms-txt-format"],
	content: ["# Codeframe", "", "> TODO: one-line summary", ""].join(NL),
	todos: [{ text: "llms.txt: add a description of /about" }],
};
const files: FixFiles = {
	files: [robotsFile, llmsFile],
	skipped: [],
	pagesRead: 18,
	pagesFailed: 0,
	generatedAt: "2026-10-20T10:00:00.000Z",
	toolVersion: "0.1.0",
};

const audit = {
	url: "https://codeframe.pro/",
	reportUrl: "https://agentcheck.test/audits/abc",
	result,
};

describe("fix files pack", () => {
	it("zips the files with README.md and AGENT-PROMPT.md", () => {
		const entries = unzipSync(fixZip(files, audit));
		expect(Object.keys(entries).sort()).toEqual([
			"AGENT-PROMPT.md",
			"README.md",
			"llms.txt",
			"robots.txt",
		]);
		expect(strFromU8(entries["robots.txt"] ?? new Uint8Array())).toBe(
			robotsFile.content,
		);
		expect(strFromU8(entries["README.md"] ?? new Uint8Array())).toBe(
			readme(files, audit),
		);
	});
});
