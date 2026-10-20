import type { CSSProperties } from "react";

/**
 * Grid cells that light up and fade, like a crawler visiting pages: column (from the
 * centre line) and row of the 44px grid, with a delay and a period in seconds. Fixed
 * rather than random, so the server and the client render the same markup.
 */
const cells: [col: number, row: number, delay: number, period: number][] = [
	[-8, 2, 0, 7],
	[-6, 5, 2.4, 8],
	[-5, 1, 4.1, 9],
	[-3, 7, 1.2, 7.5],
	[-2, 3, 5.6, 8.5],
	[-1, 0, 3.3, 9.5],
	[0, 6, 0.8, 8],
	[1, 2, 6.2, 7],
	[2, 8, 2.9, 9],
	[3, 4, 4.7, 7.5],
	[4, 1, 1.7, 8.5],
	[5, 6, 5.1, 9],
	[6, 3, 0.4, 8],
	[7, 7, 3.8, 7],
	[8, 1, 6.8, 9.5],
	[-7, 6, 4.4, 8],
];

/**
 * Decorative layers behind the hero copy: glows, a line grid whose cells light up
 * now and then, and grain. The top fades to the flat fill so the header stays
 * seamless; the grid fades out from the middle.
 */
export function HeroBackdrop({ cells: lit = true }: { cells?: boolean }) {
	return (
		<div aria-hidden="true" className="hero-fade absolute inset-0 -z-10">
			<div className="hero-glow" />
			<div className="hero-grid">
				{(lit ? cells : []).map(([col, row, delay, period]) => (
					<span
						key={`${col}:${row}`}
						className="hero-cell"
						style={
							{
								"--col": col,
								"--row": row,
								animationDelay: `${delay}s`,
								animationDuration: `${period}s`,
							} as CSSProperties
						}
					/>
				))}
			</div>
			<div className="hero-grain" />
		</div>
	);
}
