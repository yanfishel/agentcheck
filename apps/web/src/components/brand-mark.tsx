export type MarkState = "idle" | "queued" | "running" | "done" | "failed";

/**
 * The AgentCheck mark: a frame with a spark in the corner and the letters AC.
 * Only the spark moves; the state is a class, so a client component switches it
 * by re-rendering with a new `state`. Colour comes from `currentColor` and the
 * `.ac--*` rules in globals.css (brand accent; pass green for done, fail red for failed).
 */
export function BrandMark({
	state = "idle",
	className = "",
	label,
}: {
	state?: MarkState;
	className?: string;
	label?: string;
}) {
	return (
		<svg
			viewBox="0 0 100 100"
			className={`ac ac--${state} ${className}`.trim()}
			role="img"
			aria-label={label}
			aria-hidden={label ? undefined : true}
		>
			<g
				fill="none"
				stroke="currentColor"
				strokeWidth="7"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path
					className="ac-frame"
					d="M52 22H29Q16 22 16 35V71Q16 84 29 84H65Q78 84 78 71V48"
				/>
				<path
					className="ac-spark"
					d="M78 6Q80.5 19.5 94 22Q80.5 24.5 78 38Q75.5 24.5 62 22Q75.5 19.5 78 6Z"
				/>
			</g>
			<path
				className="ac-letters"
				fill="currentColor"
				d="M26.51 65 35.13 42.5H41.27L49.87 65H44.68L38.18 46L31.7 65ZM32.15 58.84V54.98H44.18V58.84ZM58.82 65.41Q56.16 65.41 54.22 64.33Q52.27 63.25 51.23 61.27Q50.18 59.28 50.18 56.55Q50.18 53.83 51.23 51.84Q52.27 49.86 54.21 48.79Q56.15 47.72 58.8 47.72Q60.71 47.72 62.35 48.41Q63.99 49.09 65.14 50.45Q66.29 51.8 66.71 53.8L62.3 54.73Q61.96 52.94 61.05 52.04Q60.15 51.14 58.77 51.14Q56.88 51.14 55.97 52.64Q55.05 54.14 55.05 56.61Q55.05 59.06 55.96 60.52Q56.87 61.98 58.79 61.98Q60.12 61.98 61.03 61.18Q61.95 60.38 62.37 58.72L66.63 59.52Q66.32 61.05 65.55 62.16Q64.79 63.28 63.72 63.99Q62.65 64.7 61.4 65.05Q60.15 65.41 58.82 65.41Z"
			/>
		</svg>
	);
}
