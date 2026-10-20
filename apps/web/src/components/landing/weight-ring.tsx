import { CATEGORIES } from "@agentcheck/core/scoring";
import { CATEGORY_META, type CategoryId } from "../category-meta";

const RADIUS = 23;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** The gap between segments, in ring units (measured between the round caps). */
const GAP = 3;
/** The current category's segment is wider than the rest. */
const WIDTH = { current: 8, other: 6 };

/**
 * The whole score as a ring: one segment per category, sized by its weight and
 * always in the same place (scoring order, clockwise from the top, the same order
 * as the cards). The current
 * category's segment is in full colour, the others fade; its weight sits in the
 * middle in the text colour.
 */
export function WeightRing({ id }: { id: CategoryId }) {
	let start = 0;
	const segments = CATEGORIES.map((category) => {
		const length = (CIRCUMFERENCE * category.weight) / 100;
		const segment = { id: category.id, start, length };
		start += length;
		return segment;
	});
	const weight = CATEGORIES.find((category) => category.id === id)?.weight ?? 0;
	return (
		<svg
			viewBox="0 0 60 60"
			role="img"
			aria-label={`${weight}% of the score`}
			className="-mt-2 -mr-2 size-15 shrink-0"
		>
			<g transform="rotate(-90 30 30)" fill="none">
				{segments.map((segment) => {
					const current = segment.id === id;
					const width = current ? WIDTH.current : WIDTH.other;
					// Round caps reach width/2 past each end, so the dash is shortened by the
					// width to keep the gap.
					const dash = Math.max(segment.length - GAP - width, 0.01);
					return (
						<circle
							key={segment.id}
							cx="30"
							cy="30"
							r={RADIUS}
							stroke="currentColor"
							strokeWidth={width}
							strokeLinecap="round"
							strokeDasharray={`${dash.toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
							strokeDashoffset={(-(segment.start + (GAP + width) / 2)).toFixed(
								2,
							)}
							className={`${CATEGORY_META[segment.id].text} ${current ? "" : "opacity-15"}`}
						/>
					);
				})}
			</g>
			<text
				x="30"
				y="34.5"
				textAnchor="middle"
				className="fill-foreground text-[13px] font-extrabold tabular-nums"
			>
				{weight}%
			</text>
		</svg>
	);
}
