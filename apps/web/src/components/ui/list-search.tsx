import { Search, X } from "lucide-react";
import Link from "next/link";
import { pageHref } from "./pagination";

type Query = Record<string, string | undefined>;

/**
 * A list's search box: a plain GET form to `path` (Enter submits, so a new
 * search starts on page 1) that keeps `query` (a filter) in hidden fields;
 * Clear drops the search and keeps the filter.
 */
export function ListSearch({
	path,
	q,
	query = {},
	placeholder,
	label,
}: {
	path: string;
	q?: string;
	query?: Query;
	placeholder: string;
	/** The input's accessible name. */
	label: string;
}) {
	return (
		<search className="w-full max-w-sm">
			<form
				action={path}
				method="get"
				className="flex w-full items-center gap-2 rounded-full border border-line bg-surface py-1 pr-1 pl-3.5 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent"
			>
				<Search aria-hidden="true" className="size-4 shrink-0 text-muted" />
				{Object.entries(query).map(([key, value]) =>
					value === undefined ? null : (
						<input key={key} type="hidden" name={key} value={value} />
					),
				)}
				<input
					type="search"
					name="q"
					defaultValue={q}
					maxLength={SEARCH_MAX}
					placeholder={placeholder}
					aria-label={label}
					className="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-foreground outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
				/>
				{q ? (
					<Link
						href={pageHref(path, query, 1)}
						aria-label="Clear search"
						className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 outline-accent outline-offset-2"
					>
						<X aria-hidden="true" className="size-4" />
					</Link>
				) : (
					<span aria-hidden="true" className="size-7 shrink-0" />
				)}
			</form>
		</search>
	);
}

/** Longest search kept (longer input is cut). */
export const SEARCH_MAX = 200;
