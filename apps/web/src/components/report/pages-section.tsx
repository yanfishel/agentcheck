import type { AuditResult } from "@agentcheck/core";
import { ChevronDown, Files, Minus, TriangleAlert, X } from "lucide-react";
import { Chip, Collapsible } from "../ui";
import { categoryTone } from "./markers";

type Crawl = NonNullable<AuditResult["crawl"]>;

const CARD =
	"rounded-[14px] border border-line bg-surface px-4 py-1 shadow-card";

function Icon() {
	return (
		<span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
			<Files aria-hidden="true" className="size-4" />
		</span>
	);
}

function pagesWord(count: number): string {
	return `${count} page${count === 1 ? "" : "s"}`;
}

/** The page's path and query: the host is the report's own (the crawl never leaves it). */
function pathOf(url: string): string {
	try {
		const { pathname, search } = new URL(url);
		return `${pathname}${search}`;
	} catch {
		return url;
	}
}

/** "fail on 7, warn on 1 of 9 pages" */
function issueCounts(issue: Crawl["issues"][number], audited: number): string {
	const parts = [
		issue.fail > 0 ? `fail on ${issue.fail}` : "",
		issue.warn > 0 ? `warn on ${issue.warn}` : "",
	].filter(Boolean);
	return `${parts.join(", ")} of ${pagesWord(audited)}`;
}

/**
 * A full report's crawl: the site score (the mean of the audited pages) and
 * the page's own, the problems counted across the pages, then each page with
 * its score and the checks it fails. An accordion like a category, closed by
 * default: the page's own sections above it carry the details.
 */
export function PagesSection({
	crawl,
	pageScore,
	heading,
}: {
	crawl: Crawl;
	/** The audited page's own score, next to the site's. */
	pageScore: number;
	heading: "h2" | "h4";
}) {
	const audited = crawl.pages.filter((p) => p.status === "audited").length;
	const trigger = (
		<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
			<span className="flex min-w-0 flex-auto items-center gap-3">
				<Icon />
				<span className="min-w-0 flex-1">
					<span className="block font-bold">Pages</span>
					<span className="block text-sm font-normal text-muted">
						{`Site score: the average of ${pagesWord(audited)}; this page ${pageScore}`}
					</span>
				</span>
			</span>
			<span className="flex flex-wrap gap-1.5">
				<Chip
					tone={categoryTone({ status: "scored", score: crawl.score })}
				>{`${crawl.score}/100`}</Chip>
			</span>
		</span>
	);
	return (
		<section className={CARD}>
			<Collapsible heading={heading} hiddenUntilFound trigger={trigger}>
				{crawl.issues.length > 0 ? (
					<div className="border-t border-line-soft py-3">
						<p className="text-sm font-semibold">Problems across the pages</p>
						<ul className="mt-2 space-y-1.5 text-sm">
							{crawl.issues.map((issue) => {
								const Mark = issue.fail > 0 ? X : TriangleAlert;
								return (
									<li
										key={issue.id}
										className="grid grid-cols-[16px_1fr] gap-x-2"
									>
										<Mark
											aria-hidden="true"
											className={`mt-0.5 size-4 ${issue.fail > 0 ? "text-fail" : "text-warn"}`}
										/>
										<span>
											{issue.title}{" "}
											<span className="text-muted">
												{issueCounts(issue, audited)}
											</span>
										</span>
									</li>
								);
							})}
						</ul>
					</div>
				) : null}
				<ul className="divide-y divide-line-soft border-t border-line-soft">
					{crawl.pages.map((page) => (
						<li
							key={page.url}
							className="grid grid-cols-[4.5rem_1fr] items-start gap-x-3 py-3"
						>
							{page.status === "audited" ? (
								<span className="justify-self-start">
									<Chip
										tone={categoryTone({ status: "scored", score: page.score })}
									>{`${page.score}/100`}</Chip>
								</span>
							) : (
								<span className="mt-[3px] text-muted">
									{page.status === "failed" ? (
										<X aria-hidden="true" className="size-[18px] text-fail" />
									) : (
										<Minus aria-hidden="true" className="size-[18px]" />
									)}
								</span>
							)}
							<div className="min-w-0">
								<a
									href={page.url}
									rel="noopener noreferrer nofollow"
									className="break-all font-mono text-sm underline decoration-line underline-offset-4 hover:decoration-current"
								>
									{pathOf(page.url)}
								</a>
								{page.status === "audited" ? (
									page.problems.length > 0 ? (
										<p className="mt-0.5 text-sm text-muted">
											{page.problems.map((p) => p.title).join(", ")}
										</p>
									) : null
								) : (
									<p className="mt-0.5 text-sm text-muted">
										{page.status === "failed" ? page.error : page.reason}
									</p>
								)}
							</div>
						</li>
					))}
				</ul>
			</Collapsible>
		</section>
	);
}

/** The Pages row of a running full check: the crawl comes with the result. */
export function WaitingPages({ heading }: { heading: "h2" | "h4" }) {
	const Heading = heading;
	return (
		<section aria-busy="true" className={CARD}>
			<div className="flex items-center gap-3 py-2">
				<Heading className="flex min-w-0 flex-auto items-center gap-3">
					<Icon />
					<span className="min-w-0 flex-1">
						<span className="block font-bold">Pages</span>
						<span className="block text-sm font-normal text-muted">
							Checking other pages of the site…
						</span>
					</span>
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
