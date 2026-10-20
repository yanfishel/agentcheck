"use client";

import { type ReactNode, useEffect, useState } from "react";
import { CategoryIcon } from "../category-meta";
import { Chip, Collapsible } from "../ui";
import { type CategoryResult, categoryTone } from "./markers";

const OPEN_EVENT = "agentcheck:open-category";

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
			<CategoryIcon id={category.id} size="sm" />
			<span className="min-w-0 flex-1">
				<span className="block font-bold">{category.title}</span>
				{category.skipReason ? (
					<span className="block text-sm font-normal text-muted">
						{category.skipReason}
					</span>
				) : null}
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

/** One category card: an accordion whose panel holds the check rows. */
export function CategorySection({
	category,
	defaultOpen,
	heading,
	footer,
	children,
}: {
	category: CategorySummary;
	defaultOpen: boolean;
	heading: "h2" | "h4";
	/** A last row under the checks (the Fix files footer). */
	footer?: ReactNode;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const anchor = categoryAnchor(category.id);

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
		<section className="rounded-[14px] border border-line bg-surface px-4 py-1 shadow-card">
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
		</section>
	);
}
