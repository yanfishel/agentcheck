import type { ReactNode } from "react";

/** `band` is for chips on the plum score band. */
export type ChipTone = "accent" | "pass" | "warn" | "fail" | "muted" | "band";

const tones: Record<ChipTone, string> = {
	accent: "bg-accent-soft text-accent",
	pass: "bg-pass-soft text-pass",
	warn: "bg-warn-soft text-warn",
	fail: "bg-fail-soft text-fail",
	muted: "bg-surface-2 text-muted",
	band: "bg-accent-fg/15 text-accent-fg",
};

/** The chip look, for elements that must be something else (a tooltip trigger). */
export function chipClass(tone: ChipTone = "muted"): string {
	return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`;
}

export function Chip({
	tone = "muted",
	children,
}: {
	tone?: ChipTone;
	children: ReactNode;
}) {
	return <span className={chipClass(tone)}>{children}</span>;
}

export function statusTone(
	status: "queued" | "running" | "done" | "failed",
): ChipTone {
	switch (status) {
		case "queued":
			return "accent";
		case "running":
			return "warn";
		case "done":
			return "pass";
		case "failed":
			return "fail";
	}
}
