import type { AuditResult } from "@agentcheck/core";
import type { ChipTone } from "../ui";

export type CategoryResult = AuditResult["categories"][number];
export type CheckResult = CategoryResult["checks"][number];
export type CheckStatus = CheckResult["status"];

export type CategoryMarker = "✓" | "!" | "✗" | "–";
export type CheckMarker = "✓" | "⚠" | "✗" | "–";

/** Same thresholds as the terminal reporter. */
export function categoryMarker<
	T extends Pick<CategoryResult, "status" | "score">,
>(category: T): CategoryMarker {
	if (category.status === "skipped" || category.score === null) return "–";
	if (category.score >= 90) return "✓";
	if (category.score >= 50) return "!";
	return "✗";
}

export function checkMarker(status: CheckStatus): CheckMarker {
	switch (status) {
		case "pass":
			return "✓";
		case "warn":
			return "⚠";
		case "fail":
			return "✗";
		case "skip":
			return "–";
	}
}

const markerTone: Record<CategoryMarker, ChipTone> = {
	"✓": "pass",
	"!": "warn",
	"✗": "fail",
	"–": "muted",
};

/** pass >= 90, warn >= 50, fail otherwise; skipped is muted. */
export function categoryTone(
	category: Pick<CategoryResult, "status" | "score">,
): ChipTone {
	return markerTone[categoryMarker(category)];
}

/** Text colour classes by tone, spelled out so Tailwind sees them. */
export const toneText: Record<ChipTone, string> = {
	accent: "text-accent",
	pass: "text-pass",
	warn: "text-warn",
	fail: "text-fail",
	muted: "text-muted",
	band: "text-accent-fg",
};
