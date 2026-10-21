"use client";

import { CATEGORIES } from "@agentcheck/core/scoring";
import { CATEGORY_META } from "../category-meta";
import type { ChipTone } from "../ui";
import { ARRIVE_POP, useArrival } from "./arrival";
import { categoryAnchor, openCategory } from "./category-section";
import { useCountUp } from "./count-up";
import { Gauge } from "./gauge";
import { type CategoryResult, categoryTone, toneText } from "./markers";

type Tile = Pick<CategoryResult, "id" | "title" | "status" | "score">;
type CategoryId = (typeof CATEGORIES)[number]["id"];

/** The gauge and number of a tile that arrives count up this long. */
const COUNT_UP_MS = 700;

/** Gauge colours by tone, spelled out so Tailwind sees them. */
const gaugeFill: Record<ChipTone, string> = {
	accent: "fill-accent-soft",
	pass: "fill-pass-soft",
	warn: "fill-warn-soft",
	fail: "fill-fail-soft",
	muted: "fill-surface-2",
	band: "fill-accent-soft",
};

const TILE =
	"flex flex-col items-center justify-center rounded-[14px] border border-line bg-surface px-3 py-4 text-center shadow-card";

/**
 * One tile: a placeholder with a pulsing empty gauge until its category is in,
 * then the score. The same element in both states, so a tile that fills in is
 * not remounted; one that fills in while the viewer watches pops in and counts
 * its score up.
 */
function CategoryTile({
	id,
	title,
	category,
}: {
	id: CategoryId;
	title: string;
	category: Tile | null;
}) {
	const arrived = useArrival(category !== null);
	const skipped =
		category !== null &&
		(category.status === "skipped" || category.score === null);
	const score = category && !skipped ? category.score : null;
	const shown = useCountUp(score, COUNT_UP_MS, arrived);
	const Icon = CATEGORY_META[id].icon;
	const tone = category ? categoryTone(category) : "muted";
	return (
		<a
			href={category ? `#${categoryAnchor(id)}` : undefined}
			onClick={category ? () => openCategory(id) : undefined}
			className={`${TILE} ${category ? "transition-colors duration-150 hover:border-accent focus-visible:outline-2 outline-accent outline-offset-2" : ""} ${arrived ? ARRIVE_POP : ""}`}
		>
			{category === null ? (
				<Gauge
					value={0}
					arc=""
					track="stroke-line-soft"
					fill="fill-surface-2"
					className="size-20 motion-safe:animate-pulse"
				/>
			) : (
				<Gauge
					value={shown}
					arc={toneText[tone]}
					track="stroke-line-soft"
					fill={gaugeFill[tone]}
					className="size-20"
				>
					{skipped ? (
						<span className="text-xs font-semibold text-muted">Skipped</span>
					) : (
						<span
							className={`text-2xl leading-none font-extrabold tracking-tight tabular-nums ${toneText[tone]}`}
						>
							{shown}
						</span>
					)}
				</Gauge>
			)}
			{/* The icon sits inline with the title, so a wrapped title stays centred with it. */}
			<span className="mt-3 text-center text-xs leading-5 font-semibold text-balance text-muted">
				<Icon
					aria-hidden="true"
					className={`mr-1.5 inline size-4 align-[-4px] ${CATEGORY_META[id].text}`}
				/>
				{title}
			</span>
		</a>
	);
}

/**
 * Four score tiles, Lighthouse-style: a gauge in the status colour (pass >= 90,
 * warn >= 50, fail below) with the score inside, then the category icon and
 * title. Each tile links to its category and opens the accordion. `partial`
 * (an audit still running): a tile for every category, those not in yet as
 * placeholders.
 */
export function CategoryTiles({
	categories,
	partial = false,
}: {
	categories: Tile[];
	partial?: boolean;
}) {
	const tiles = partial
		? CATEGORIES.map(({ id, title }) => ({
				id,
				title,
				category: categories.find((category) => category.id === id) ?? null,
			}))
		: categories.map((category) => ({
				id: category.id as CategoryId,
				title: category.title,
				category,
			}));
	return (
		<nav
			aria-label="Categories"
			className="grid grid-cols-2 gap-3 sm:grid-cols-4"
		>
			{tiles.map(({ id, title, category }) => (
				<CategoryTile key={id} id={id} title={title} category={category} />
			))}
		</nav>
	);
}

/**
 * The tiles before a result exists: the same tiles with empty gauges, so the
 * layout does not move when the scores fill in. Not links, there is nothing to
 * open yet.
 */
export function PendingTiles() {
	return (
		<ul
			aria-label="Categories"
			className="grid grid-cols-2 gap-3 sm:grid-cols-4"
		>
			{CATEGORIES.map(({ id, title }) => {
				const Icon = CATEGORY_META[id].icon;
				return (
					<li
						key={id}
						className="flex flex-col items-center justify-center rounded-[14px] border border-line bg-surface px-3 py-4 text-center shadow-card"
					>
						<Gauge
							value={0}
							arc=""
							track="stroke-line-soft"
							fill="fill-surface-2"
							className="size-20 motion-safe:animate-pulse"
						/>
						<span className="mt-3 text-center text-xs leading-5 font-semibold text-balance text-muted">
							<Icon
								aria-hidden="true"
								className={`mr-1.5 inline size-4 align-[-4px] ${CATEGORY_META[id].text}`}
							/>
							{title}
						</span>
					</li>
				);
			})}
		</ul>
	);
}
