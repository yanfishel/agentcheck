import type { ReactNode } from "react";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A Lighthouse-style score gauge: a faint track, an optional inner fill and a
 * round-capped arc from the top, as long as `value` (0..100; none at 0). Colours
 * are classes so callers pick tokens: `arc` a text-* class (currentColor),
 * `track` a stroke-* class, `fill` a fill-* class; `spin` adds classes to the
 * drawing alone (an animation), so the children stay still.
 */
export function Gauge({
	value,
	arc,
	track,
	fill,
	className,
	spin = "",
	children,
}: {
	value: number;
	arc: string;
	track: string;
	fill?: string;
	className: string;
	spin?: string;
	children?: ReactNode;
}) {
	const clamped = Math.min(100, Math.max(0, value));
	const length = (CIRCUMFERENCE * clamped) / 100;
	return (
		<div className={`relative grid shrink-0 place-items-center ${className}`}>
			<svg
				viewBox="0 0 100 100"
				aria-hidden="true"
				className={`absolute inset-0 size-full -rotate-90 ${spin}`.trim()}
			>
				{fill ? (
					<circle cx="50" cy="50" r={RADIUS - 4.5} className={fill} />
				) : null}
				<circle
					cx="50"
					cy="50"
					r={RADIUS}
					fill="none"
					strokeWidth="9"
					className={track}
				/>
				{clamped > 0 ? (
					<circle
						cx="50"
						cy="50"
						r={RADIUS}
						fill="none"
						stroke="currentColor"
						strokeWidth="9"
						strokeLinecap="round"
						strokeDasharray={`${length.toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
						className={arc}
					/>
				) : null}
			</svg>
			{/* A grid blockifies the children, so an inline label gets no strut from
			    the inherited line height and sits on the ring's centre. */}
			<div className="relative grid place-items-center">{children}</div>
		</div>
	);
}
