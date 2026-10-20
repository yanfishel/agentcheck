import { styleText } from "node:util";
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

	lines.push(` ${RULE}`);
	lines.push(
		` ${paint("bold", `OVERALL AI SCORE: ${result.score} / 100 [${result.grade}]`)}`,
	);

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
