import type {
	CategoryId,
	CategoryResult,
	CheckResult,
	Grade,
} from "./types.ts";

export const CATEGORIES: readonly {
	id: CategoryId;
	title: string;
	weight: number;
}[] = [
	{ id: "ai-manifests", title: "AI Manifests", weight: 30 },
	{ id: "bot-access", title: "Bot Access", weight: 20 },
	{ id: "content-semantics", title: "Content & Semantics", weight: 25 },
	{ id: "agentic-actionability", title: "Agentic Actionability", weight: 25 },
];

const GRADE_THRESHOLDS: readonly [number, Grade][] = [
	[95, "A+"],
	[90, "A"],
	[80, "B"],
	[70, "C"],
	[60, "D"],
];

export function gradeFor(score: number): Grade {
	for (const [min, grade] of GRADE_THRESHOLDS) {
		if (score >= min) return grade;
	}
	return "F";
}

export function buildCategoryResults(
	results: Array<CheckResult & { category: CategoryId }>,
): CategoryResult[] {
	return CATEGORIES.map(({ id, title, weight }) => {
		const checks = results
			.filter((r) => r.category === id)
			.map(({ category: _category, ...check }) => check);
		const runnable = checks.filter((c) => c.status !== "skip");
		const max = runnable.reduce((sum, c) => sum + c.weight, 0);
		if (max === 0) {
			return {
				id,
				title,
				weight,
				status: "skipped",
				score: null,
				skipReason:
					checks.length === 0
						? "No checks available yet"
						: (checks[0]?.message ?? "All checks were skipped"),
				checks,
			};
		}
		const earned = runnable.reduce(
			(sum, c) =>
				sum +
				(c.status === "pass"
					? c.weight
					: c.status === "warn"
						? c.weight / 2
						: 0),
			0,
		);
		return {
			id,
			title,
			weight,
			status: "scored",
			score: Math.round((earned / max) * 100),
			checks,
		};
	});
}

export function overallScore(categories: CategoryResult[]): number {
	let weighted = 0;
	let totalWeight = 0;
	for (const c of categories) {
		if (c.status === "scored") {
			weighted += c.score * c.weight;
			totalWeight += c.weight;
		}
	}
	if (totalWeight === 0)
		throw new Error("Cannot compute overall score: no category was scored");
	return Math.round(weighted / totalWeight);
}
