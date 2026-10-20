"use client";

import { CATEGORIES } from "@agentcheck/core/scoring";
import { CATEGORY_META } from "../category-meta";
import type { ChipTone } from "../ui";
import { categoryAnchor, openCategory } from "./category-section";
import { Gauge } from "./gauge";
import { type CategoryResult, categoryTone, toneText } from "./markers";

type Tile = Pick<CategoryResult, "id" | "title" | "status" | "score">;

/** Gauge colours by tone, spelled out so Tailwind sees them. */
const gaugeFill: Record<ChipTone, string> = {
	accent: "fill-accent-soft",
	pass: "fill-pass-soft",
	warn: "fill-warn-soft",
	fail: "fill-fail-soft",
	muted: "fill-surface-2",
	band: "fill-accent-soft",
};

/**
 * Four score tiles, Lighthouse-style: a gauge in the status colour (pass >= 90,
 * warn >= 50, fail below) with the score inside, then the category icon and
 * title. Each tile links to its category and opens the accordion.
 */
export function CategoryTiles({ categories }: { categories: Tile[] }) {
	return (
		<nav
			aria-label="Categories"
			className="grid grid-cols-2 gap-3 sm:grid-cols-4"
		>
			{categories.map((category) => {
				const skipped =
					category.status === "skipped" || category.score === null;
				const tone = categoryTone(category);
				const Icon = CATEGORY_META[category.id].icon;
				return (
					<a
						key={category.id}
						href={`#${categoryAnchor(category.id)}`}
						onClick={() => openCategory(category.id)}
						className="flex flex-col items-center justify-center rounded-[14px] border border-line bg-surface px-3 py-4 text-center shadow-card transition-colors duration-150 hover:border-accent focus-visible:outline-2 outline-accent outline-offset-2"
					>
						<Gauge
							value={skipped ? 0 : (category.score ?? 0)}
							arc={toneText[tone]}
							track="stroke-line-soft"
							fill={gaugeFill[tone]}
							className="size-20"
						>
							{skipped ? (
								<span className="text-xs font-semibold text-muted">
									Skipped
								</span>
							) : (
								<span
									className={`text-2xl leading-none font-extrabold tracking-tight tabular-nums ${toneText[tone]}`}
								>
									{category.score}
								</span>
							)}
						</Gauge>
						{/* The icon sits inline with the title, so a wrapped title stays centred with it. */}
						<span className="mt-3 text-center text-xs leading-5 font-semibold text-balance text-muted">
							<Icon
								aria-hidden="true"
								className={`mr-1.5 inline size-4 align-[-4px] ${CATEGORY_META[category.id].text}`}
							/>
							{category.title}
						</span>
					</a>
				);
			})}
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
