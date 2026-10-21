"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { CategoryIcon, type CategoryId } from "../category-meta";
import { Chip, Collapsible } from "../ui";
import { useArrivalLive } from "./arrival";
import { type CategoryResult, categoryTone } from "./markers";

const OPEN_EVENT = "agentcheck:open-category";
/** An arriving section opens this long after it mounts closed, so the accordion animates its height. */
const ARRIVAL_OPEN_DELAY_MS = 60;

/** Asks the accordion of a category to open (used by the score tiles). */
export function openCategory(id: string): void {
	window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
}

export function categoryAnchor(id: string): string {
	return `category-${id}`;
}

export type CategorySummary = Pick<
	CategoryResult,
	"id" | "title" | "status" | "score"
> & {
	skipReason: string | null;
	checks: number;
	warn: number;
	fail: number;
};

function Summary({ category }: { category: CategorySummary }) {
	return (
		<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
			{/* Icon and title stay together and keep their natural width (flex-auto),
			    so chips that do not fit beside the whole title wrap under it; with a
			    zero basis the title got a sliver of the line and its words overflowed
			    under the chips on narrow screens. */}
			<span className="flex min-w-0 flex-auto items-center gap-3">
				<CategoryIcon id={category.id} size="sm" />
				<span className="min-w-0 flex-1">
					<span className="block font-bold">{category.title}</span>
					{category.skipReason ? (
						<span className="block text-sm font-normal text-muted">
							{category.skipReason}
						</span>
					) : null}
				</span>
			</span>
			<span className="flex flex-wrap gap-1.5">
				{category.status === "skipped" || category.score === null ? (
					<Chip>skipped</Chip>
				) : (
					<Chip tone={categoryTone(category)}>{`${category.score}/100`}</Chip>
				)}
				{category.warn > 0 ? (
					<Chip tone="warn">{`${category.warn} warn`}</Chip>
				) : null}
				{category.fail > 0 ? (
					<Chip tone="fail">{`${category.fail} fail`}</Chip>
				) : null}
			</span>
		</span>
	);
}

/** The card's outer box, shared by a section and its waiting row. */
const CARD =
	"rounded-[14px] border border-line bg-surface px-4 py-1 shadow-card";

/**
 * A section's place while its category is not in yet: the icon and title, a
 * pulsing chip where the score goes and a faded chevron; not openable.
 */
export function WaitingSection({
	id,
	title,
	heading,
}: {
	id: CategoryId;
	title: string;
	heading: "h2" | "h4";
}) {
	const Heading = heading;
	return (
		<section aria-busy="true" className={CARD}>
			{/* The height of a section's closed header, so nothing moves on arrival. */}
			<div className="flex items-center gap-3 py-2">
				<Heading className="flex min-w-0 flex-auto items-center gap-3 font-bold">
					<CategoryIcon id={id} size="sm" />
					{title}
				</Heading>
				<span className="h-6 w-16 rounded-full bg-surface-2 motion-safe:animate-pulse" />
				<ChevronDown
					aria-hidden="true"
					className="size-4 shrink-0 text-muted/40"
				/>
			</div>
		</section>
	);
}

/**
 * One category card: an accordion whose panel holds the check rows. Open from
 * the start with `defaultOpen`; a section that arrives while its report
 * animates mounts closed and then opens, so the accordion animates its height.
 */
export function CategorySection({
	category,
	defaultOpen,
	heading,
	footer,
	aside,
	children,
}: {
	category: CategorySummary;
	defaultOpen: boolean;
	heading: "h2" | "h4";
	/** A last row under the checks (the Fix files footer). */
	footer?: ReactNode;
	/** A row under the header, shown whether the panel is open or not (the Full check offer). */
	aside?: ReactNode;
	children: ReactNode;
}) {
	const live = useArrivalLive();
	const [openOnArrival] = useState(() => defaultOpen && live);
	const [open, setOpen] = useState(defaultOpen && !openOnArrival);
	const anchor = categoryAnchor(category.id);

	useEffect(() => {
		if (!openOnArrival) return;
		const timer = setTimeout(() => setOpen(true), ARRIVAL_OPEN_DELAY_MS);
		return () => clearTimeout(timer);
	}, [openOnArrival]);

	useEffect(() => {
		function onOpen(event: Event) {
			if ((event as CustomEvent<string>).detail === category.id) setOpen(true);
		}
		function onHash() {
			if (window.location.hash === `#${anchor}`) setOpen(true);
		}
		onHash();
		window.addEventListener(OPEN_EVENT, onOpen);
		window.addEventListener("hashchange", onHash);
		return () => {
			window.removeEventListener(OPEN_EVENT, onOpen);
			window.removeEventListener("hashchange", onHash);
		};
	}, [category.id, anchor]);

	const Heading = heading;
	return (
		<section className={CARD}>
			{category.checks === 0 ? (
				<Heading id={anchor} className="py-2 pr-6">
					<Summary category={category} />
				</Heading>
			) : (
				<Collapsible
					id={anchor}
					open={open}
					onOpenChange={setOpen}
					heading={heading}
					hiddenUntilFound
					trigger={<Summary category={category} />}
				>
					<ul className="divide-y divide-line-soft border-t border-line-soft">
						{children}
					</ul>
					{footer}
				</Collapsible>
			)}
			{aside ? (
				<div className="border-t border-line-soft py-3">{aside}</div>
			) : null}
		</section>
	);
}
