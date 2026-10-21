"use client";

import type { AuditResult } from "@agentcheck/core";
import { ARRIVE_FADE, ARRIVE_POP, useArrival } from "./arrival";
import { useCountUp } from "./count-up";
import { GradeMark } from "./grade-mark";
import { ScoreRing } from "./score-ring";

type Grade = AuditResult["grade"];

/** The band ring's count-up when the total score arrives. */
export const BAND_COUNT_UP_MS = 900;

/**
 * The band's score ring: when it appears while the viewer watches (a running
 * audit finishes), it pops in and its arc and number count up from 0.
 */
export function BandScoreRing({
	score,
	grade,
	large,
}: {
	score: number;
	grade: Grade;
	large: boolean;
}) {
	const arrived = useArrival(true);
	const value = useCountUp(score, BAND_COUNT_UP_MS, arrived);
	return (
		<ScoreRing
			score={value}
			grade={grade}
			large={large}
			className={arrived ? ARRIVE_POP : ""}
		/>
	);
}

/**
 * The band's grade in the brand frame: fades in when it appears while the
 * viewer watches. Opacity only, so the mark keeps its own offset.
 */
export function BandGradeMark({
	grade,
	className,
}: {
	grade: Grade;
	className: string;
}) {
	const arrived = useArrival(true);
	return (
		<GradeMark
			grade={grade}
			className={`${className} ${arrived ? ARRIVE_FADE : ""}`.trim()}
		/>
	);
}
