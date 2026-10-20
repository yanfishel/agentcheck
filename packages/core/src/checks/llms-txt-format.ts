import { isTextResource } from "../http.ts";
import type { Check } from "../types.ts";
import { describeProblem } from "./text-manifest.ts";

const LINK_ITEM = /^\s*[-*]\s+\[[^\]]+\]\([^)]+\)/;

export const llmsTxtFormat: Check = {
	id: "llms-txt-format",
	category: "ai-manifests",
	title: "llms.txt follows the llmstxt.org format",
	weight: 20,
	async run(ctx) {
		const res = await ctx.get("/llms.txt");
		if (res.kind !== "response" || !isTextResource(res)) {
			return {
				status: "fail",
				message: `llms.txt ${describeProblem(res)}; nothing to validate`,
				remediation:
					"Publish /llms.txt first, then follow the llmstxt.org format.",
			};
		}
		const lines = res.body.replace(/^﻿/, "").split(/\r?\n/);
		const firstIndex = lines.findIndex((line) => line.trim() !== "");
		const hasTitle = /^#\s+\S/.test(lines[firstIndex] ?? "");
		const hasSummary = lines.some((line) => /^>\s*\S/.test(line));

		let inSection = false;
		let hasLinkSection = false;
		for (const line of lines) {
			if (/^##\s+\S/.test(line)) inSection = true;
			else if (/^#\s/.test(line)) inSection = false;
			else if (inSection && LINK_ITEM.test(line)) hasLinkSection = true;
		}

		const problems: string[] = [];
		if (!hasTitle) problems.push("no H1 title on the first line");
		if (!hasLinkSection) {
			problems.push('no "## " section with a markdown link list');
		}
		if (problems.length > 0) {
			return {
				status: "fail",
				message: "llms.txt does not follow the llmstxt.org format",
				details: problems,
				remediation:
					"Start with an H1 title, then add ## sections whose items are '- [Title](url): description' links (see llmstxt.org).",
			};
		}
		if (!hasSummary) {
			return {
				status: "warn",
				message: "llms.txt has no summary blockquote",
				remediation:
					"Add a short '> summary' line right after the H1 title describing the site.",
			};
		}
		return {
			status: "pass",
			message: "llms.txt follows the llmstxt.org format",
		};
	},
};
