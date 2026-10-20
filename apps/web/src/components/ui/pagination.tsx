import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink, buttonClass } from "./button";
import { Tooltip } from "./tooltip";

type Query = Record<string, string | undefined>;

/** The list's own query plus the page; page 1 leaves `page` out so the first page keeps its plain URL. */
export function pageHref(path: string, query: Query, page: number): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined) params.set(key, value);
	}
	if (page > 1) params.set("page", String(page));
	const search = params.toString();
	return search ? `${path}?${search}` : path;
}

const OFF = "pointer-events-none opacity-60";

/** A round icon-only control as tall as the small text buttons beside it (34 px). */
const ROUND =
	"grid size-[34px] shrink-0 place-items-center rounded-full border border-line bg-surface text-foreground transition-colors hover:bg-surface-2 focus-visible:outline-2 outline-accent outline-offset-2";

function EdgeLink({
	href,
	label,
	icon,
}: {
	href: string | null;
	label: string;
	icon: ReactNode;
}) {
	if (!href) {
		return (
			<span aria-disabled="true" className={`${ROUND} ${OFF}`}>
				{icon}
				<span className="sr-only">{label}</span>
			</span>
		);
	}
	return (
		<Tooltip content={label}>
			<Link href={href} aria-label={label} className={ROUND}>
				{icon}
			</Link>
		</Tooltip>
	);
}

function StepLink({
	href,
	rel,
	icon,
	children,
}: {
	href: string | null;
	rel: "prev" | "next";
	icon: ReactNode;
	children: string;
}) {
	// Next carries its chevron on the right; on a phone both are round icon buttons.
	const look = `max-sm:size-[34px] max-sm:px-0 ${rel === "next" ? "flex-row-reverse" : ""}`;
	const label = <span className="max-sm:sr-only">{children}</span>;
	if (!href) {
		return (
			<span
				aria-disabled="true"
				className={buttonClass("secondary", "sm", `${OFF} ${look}`)}
			>
				{icon}
				{label}
			</span>
		);
	}
	return (
		<ButtonLink
			variant="secondary"
			size="sm"
			href={href}
			rel={rel}
			icon={icon}
			className={look}
		>
			{label}
		</ButtonLink>
	);
}

/**
 * First, Previous, "Page N of M", Next, Last under a list; links keep `query`
 * (a filter, for example). First and Last are round icon buttons and appear
 * from three pages on (with two they repeat Previous and Next); on a phone
 * Previous and Next drop their text too. The ends show disabled controls; a
 * single page renders nothing.
 */
export function Pagination({
	page,
	pages,
	path,
	query = {},
}: {
	page: number;
	pages: number;
	path: string;
	query?: Query;
}) {
	if (pages <= 1) return null;
	const to = (target: number, enabled: boolean) =>
		enabled ? pageHref(path, query, target) : null;
	const edges = pages > 2;
	return (
		<nav
			aria-label="Pagination"
			className="mt-6 flex items-center justify-center gap-2 sm:gap-3"
		>
			{edges ? (
				<EdgeLink
					href={to(1, page > 1)}
					label="First page"
					icon={<ChevronsLeft aria-hidden="true" className="size-4" />}
				/>
			) : null}
			<StepLink
				href={to(page - 1, page > 1)}
				rel="prev"
				icon={<ChevronLeft aria-hidden="true" className="size-4 sm:-ml-0.5" />}
			>
				Previous
			</StepLink>
			<p className="px-1 text-sm whitespace-nowrap text-muted">
				{`Page ${page} of ${pages}`}
			</p>
			<StepLink
				href={to(page + 1, page < pages)}
				rel="next"
				icon={<ChevronRight aria-hidden="true" className="size-4 sm:-mr-0.5" />}
			>
				Next
			</StepLink>
			{edges ? (
				<EdgeLink
					href={to(pages, page < pages)}
					label="Last page"
					icon={<ChevronsRight aria-hidden="true" className="size-4" />}
				/>
			) : null}
		</nav>
	);
}
