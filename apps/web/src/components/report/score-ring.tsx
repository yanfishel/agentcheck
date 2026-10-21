import type { AuditResult } from "@agentcheck/core";
import { Gauge } from "./gauge";
import { gradeStroke } from "./grade-mark";

type Grade = AuditResult["grade"];

/**
 * A soft light disc under the band's ring that reaches a few pixels past it, so
 * the ring lifts off the plum band. The pending ring shares it, so
 * nothing changes size when the score arrives.
 */
export const HALO = "rounded-full bg-score-halo ring-4 ring-score-halo";

/** The score as a round-capped arc over a faint track, coloured by grade. */
export function ScoreRing({
	score,
	grade,
	large = false,
	className = "",
}: {
	score: number;
	grade: Grade;
	/** The report page's band: a bigger ring from sm up. */
	large?: boolean;
	className?: string;
}) {
	return (
		<Gauge
			value={score}
			arc={gradeStroke(grade)}
			track="stroke-accent-fg/20"
			className={`${HALO} ${large ? "size-24 sm:size-32" : "size-24"} ${className}`.trim()}
		>
			<p className="flex flex-col items-center">
				<span
					className={`leading-none font-extrabold tracking-tight tabular-nums ${large ? "text-3xl sm:text-[2.5rem]" : "text-3xl"}`}
				>
					{score}
				</span>
				<span
					className={`mt-0.5 leading-none text-accent-fg/85 ${large ? "text-xs sm:text-sm" : "text-xs"}`}
				>
					of 100
				</span>
			</p>
		</Gauge>
	);
}
