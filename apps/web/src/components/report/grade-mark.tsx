import type { AuditResult } from "@agentcheck/core";

type Grade = AuditResult["grade"];

/**
 * The grade's colour on the band (the score ring's arc and the grade mark), in three steps like the category markers: green
 * from 90 (A+, A), yellow for B to D, red for F.
 */
export function gradeStroke(grade: Grade): string {
	switch (grade) {
		case "A+":
		case "A":
			return "text-band-pass";
		case "B":
		case "C":
		case "D":
			return "text-band-warn";
		case "F":
			return "text-band-fail";
	}
}

/**
 * The grade inside the brand mark's frame, spark in the corner (the paths of
 * components/brand-mark.tsx; the letters AC give way to the grade). Uses the
 * mark's .ac classes, so the spark glints like the logo. The frame and the
 * letters take the grade's colour, like the ring's arc; the spark keeps
 * currentColor (white on the band), so the mark stays the brand's.
 */
export function GradeMark({
	grade,
	className = "",
	stamp = false,
}: {
	grade: Grade;
	className?: string;
	/**
	 * The small stamp on a tile: the box is the frame alone (so the frame, not
	 * the whole mark, is centred), lines are lighter, and the spark reaches out
	 * past the box's corner with a soft shadow under it.
	 */
	stamp?: boolean;
}) {
	// Two characters (A+) need a smaller size to stay inside the frame.
	const fontSize = grade.length > 1 ? 34 : 44;
	return (
		<svg
			viewBox={stamp ? "16 22 62 62" : "0 0 100 100"}
			role="img"
			aria-label={`Grade ${grade}`}
			className={`ac ac--idle ${stamp ? "overflow-visible" : ""} ${className}`.trim()}
		>
			<g
				fill="none"
				stroke="currentColor"
				strokeWidth={stamp ? 5.5 : 7}
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path
					className={`ac-frame ${gradeStroke(grade)}`}
					d="M52 22H29Q16 22 16 35V71Q16 84 29 84H65Q78 84 78 71V48"
				/>
				<path
					className={
						stamp
							? "ac-spark drop-shadow-[0_1px_2px_var(--spark-shadow)]"
							: "ac-spark"
					}
					d="M78 6Q80.5 19.5 94 22Q80.5 24.5 78 38Q75.5 24.5 62 22Q75.5 19.5 78 6Z"
				/>
			</g>
			<text
				className={gradeStroke(grade)}
				x="47"
				y="53"
				textAnchor="middle"
				dominantBaseline="central"
				fontSize={fontSize}
				fontWeight="800"
				fill="currentColor"
			>
				{grade}
			</text>
		</svg>
	);
}
