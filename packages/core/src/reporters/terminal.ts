import { styleText } from "node:util";
import { pagesWord, protocolsLine } from "../protocols-line.ts";
import type { AuditResult, CategoryResult, CheckResult } from "../types.ts";

export interface TerminalOptions {
	color: boolean;
}

const NAME_WIDTH = 23;
const RULE = "─".repeat(46);

type Format = Parameters<typeof styleText>[0];

export function renderTerminal(
	result: AuditResult,
	opts: TerminalOptions,
): string {
	const paint = (format: Format, text: string): string =>
		opts.color ? styleText(format, text, { validateStream: false }) : text;

	const categoryMarker = (category: CategoryResult): string => {
		if (category.status === "skipped") {
			return paint("dim", "[–]");
		}
		if (category.score >= 90) return paint("green", "[✓]");
		if (category.score >= 50) return paint("yellow", "[!]");
		return paint("red", "[✗]");
	};

	const checkMarker = (check: CheckResult): string => {
		switch (check.status) {
			case "pass":
				return paint("green", "✓");
			case "warn":
				return paint("yellow", "⚠");
			case "fail":
				return paint("red", "✗");
			case "skip":
				return paint("dim", "–");
		}
	};

	const lines: string[] = [
		` AgentCheck v${result.tool.version} — AI-Readiness Audit`,
		` Target: ${result.target}`,
	];
	if (result.browser.used) {
		const { engine, version, renderMs } = result.browser;
		lines.push(
			paint(
				"dim",
				` Browser: ${engine} ${version} (rendered in ${(renderMs / 1000).toFixed(1)} s)`,
			),
		);
	}
	lines.push("");

	for (const category of result.categories) {
		const name = category.title.padEnd(NAME_WIDTH);
		const score =
			category.status === "skipped"
				? paint("dim", "skipped")
				: `${String(category.score).padStart(3)}/100`;
		lines.push(` ${categoryMarker(category)} ${name}${score}`);

		for (const check of category.checks) {
			lines.push(`     ${checkMarker(check)} ${check.message}`);
			if (check.status === "skip") continue;
			for (const detail of check.details ?? []) {
				lines.push(paint("dim", `       ${detail}`));
			}
			if (
				(check.status === "warn" || check.status === "fail") &&
				check.remediation
			) {
				lines.push(`       → ${check.remediation}`);
			}
		}
		lines.push("");
	}

	if (result.protocols) {
		const { checked, found } = result.protocols;
		lines.push(
			` ${paint("dim", "[·]")} ${"Agent protocols".padEnd(NAME_WIDTH)}${paint("dim", "not scored")}`,
		);
		for (const protocol of found) {
			lines.push(`     ${paint("green", "✓")} ${protocol.title}`);
			lines.push(paint("dim", `       ${protocol.url}`));
		}
		lines.push(
			paint("dim", `     ${protocolsLine(checked.length, found.length)}`),
		);
		lines.push("");
	}

	if (result.crawl) {
		const { pages, issues } = result.crawl;
		const audited = pages.filter((p) => p.status === "audited").length;
		lines.push(
			` ${paint("dim", "[·]")} ${`Pages (${pages.length})`.padEnd(NAME_WIDTH)}${paint("dim", `${audited} audited`)}`,
		);
		for (const page of pages) {
			if (page.status === "audited") {
				lines.push(
					`     ${String(page.score).padStart(3)}  ${page.grade.padEnd(2)}  ${page.url}`,
				);
			} else {
				lines.push(
					`     ${paint("red", "  ✗")}      ${page.url} ${paint("dim", `(${page.error})`)}`,
				);
			}
		}
		if (issues.length > 0) {
			lines.push("", "     Problems across the pages:");
			for (const issue of issues) {
				const marker =
					issue.fail > 0 ? paint("red", "✗") : paint("yellow", "⚠");
				const counts = [
					issue.fail > 0 ? `fail on ${issue.fail}` : "",
					issue.warn > 0 ? `warn on ${issue.warn}` : "",
				]
					.filter(Boolean)
					.join(", ");
				lines.push(
					`     ${marker} ${issue.title}: ${counts} of ${pagesWord(audited)}`,
				);
			}
		}
		lines.push("");
	}

	lines.push(` ${RULE}`);
	if (result.crawl) {
		const audited = result.crawl.pages.filter(
			(p) => p.status === "audited",
		).length;
		lines.push(
			` ${paint("bold", `SITE AI SCORE: ${result.crawl.score} / 100 [${result.crawl.grade}]`)} ${paint("dim", `(average of ${pagesWord(audited)}; this page ${result.score} [${result.grade}])`)}`,
		);
	} else {
		lines.push(
			` ${paint("bold", `OVERALL AI SCORE: ${result.score} / 100 [${result.grade}]`)}`,
		);
	}

	const skipped = result.categories.flatMap((category) =>
		category.status === "skipped"
			? [`${category.title} (${category.skipReason})`]
			: [],
	);
	if (skipped.length > 0) {
		lines.push(paint("dim", ` Skipped: ${skipped.join(", ")}`));
	}

	return `${lines.join("\n")}\n`;
}
