import type { AuditResult } from "@agentcheck/core";
import { CATEGORIES } from "@agentcheck/core/scoring";
import type { ReactNode } from "react";
import { HeroBackdrop } from "./landing/hero-backdrop";
import { PlumBand } from "./plum-band";
import { ArrivalProvider, Arrive } from "./report/arrival";
import {
	CategorySection,
	type CategorySummary,
	WaitingSection,
} from "./report/category-section";
import { CategoryTiles } from "./report/category-tiles";
import { CheckRow } from "./report/check-row";
import { headline } from "./report/headline";
import type { CategoryResult } from "./report/markers";
import { PagesSection, WaitingPages } from "./report/pages-section";
import { ProtocolsSection } from "./report/protocols-section";
import { relativeTime } from "./report/relative-time";
import { ScoreBand } from "./report/score-band";
import type { ScreenshotSources } from "./report/screenshot-thumb";
import { Chip, chipClass, Tooltip } from "./ui";

export { categoryMarker, checkMarker } from "./report/markers";

/**
 * A running audit's report so far: the target and the categories whose checks
 * are all in (complete categories only).
 */
export interface PartialAuditView {
	target: string;
	categories: CategoryResult[];
}

function isComplete(
	result: AuditResult | PartialAuditView,
): result is AuditResult {
	return "grade" in result;
}

function absoluteTime(timestamp: string): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return timestamp;
	return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function browserLabel(browser: AuditResult["browser"]): string {
	if (!browser.used) return "No browser";
	const engine =
		browser.engine.charAt(0).toUpperCase() + browser.engine.slice(1);
	return `${engine} ${browser.version}`;
}

function summarize(category: CategoryResult): CategorySummary {
	const count = (status: "warn" | "fail") =>
		category.checks.filter((check) => check.status === status).length;
	return {
		id: category.id,
		title: category.title,
		status: category.status,
		score: category.score,
		skipReason: category.status === "skipped" ? category.skipReason : null,
		checks: category.checks.length,
		warn: count("warn"),
		fail: count("fail"),
	};
}

/** The score band of a finished report: on the plum band, or on a card for the example. */
function ReportBand({
	result,
	example,
	tag,
	mode,
	screenshot,
	favicon,
	now,
}: {
	result: AuditResult;
	example: boolean;
	tag?: string;
	mode?: "quick" | "full";
	screenshot?: ScreenshotSources;
	favicon?: string;
	now: number;
}) {
	const lead = headline(result);
	const chips = (
		<>
			{tag ? <Chip tone="band">{tag}</Chip> : null}
			{mode ? (
				<Chip tone="band">
					{mode === "full" ? "Full check" : "Quick check"}
				</Chip>
			) : null}
			{lead.pages !== null ? (
				<Chip tone="band">{`${lead.pages} page${lead.pages === 1 ? "" : "s"}`}</Chip>
			) : null}
			<Chip tone="band">{browserLabel(result.browser)}</Chip>
			<Tooltip content={absoluteTime(result.timestamp)}>
				<button type="button" className={`${chipClass("band")} cursor-default`}>
					<time dateTime={result.timestamp}>
						{relativeTime(result.timestamp, now)}
					</time>
				</button>
			</Tooltip>
		</>
	);

	// The example is the live band on a rounded card: same backdrop, ring,
	// thumbnail and site icon, lower heading level.
	return example ? (
		<div className="on-band relative isolate overflow-hidden rounded-[22px] bg-accent text-accent-fg">
			<HeroBackdrop cells={false} />
			<div className="relative px-5 py-6 sm:px-8 sm:py-8">
				<ScoreBand
					result={result}
					chips={chips}
					heading="h3"
					surface={false}
					screenshot={screenshot}
					favicon={favicon}
				/>
			</div>
		</div>
	) : (
		<PlumBand>
			<ScoreBand
				result={result}
				chips={chips}
				heading="h1"
				surface={false}
				screenshot={screenshot}
				favicon={favicon}
				celebrate={mode === "full" && lead.score === 100}
			/>
		</PlumBand>
	);
}

/**
 * A pure rendering of an audit result, without "use client": a server
 * component on the shared page and the landing, rendered on the client inside
 * `LiveReport` on the audit page. `full` puts the score on
 * a full-width plum band (the page must not wrap it in a width container) and the
 * rest at page width; `example` is the landing's static sample: the same band on
 * a rounded card, an Example chip, lower heading levels, no actions.
 *
 * A partial result (an audit still running) draws a placeholder tile and a
 * waiting row for each category not in yet, and the action row the caller
 * passes (drawn inert while the audit runs) with `notice` under it; asides and
 * footers wait for the finished report. With `animate` the pieces that appear
 * after the first render arrive animated (tiles pop and count up, a section
 * fades and rises in over its waiting row and opens itself when it has
 * problems, and a band that replaces `band` when the audit finishes pops its
 * ring in with a count-up). Tiles and section slots are keyed by category, so
 * a later result never remounts them.
 */
export function AuditReport({
	result,
	variant = "full",
	defaultOpen = "problems",
	mode,
	label,
	actions,
	screenshot,
	favicon,
	fixFiles,
	categoryFooter,
	categoryAside,
	band: bandOverride,
	notice,
	animate = false,
	now = Date.now(),
}: {
	result: AuditResult | PartialAuditView;
	variant?: "full" | "example";
	defaultOpen?: "problems" | "none";
	mode?: "quick" | "full";
	/** A chip at the start of the band, e.g. "Shared report". */
	label?: string;
	actions?: ReactNode;
	/** The page's thumbnail on the band (the example's is a saved file). */
	screenshot?: ScreenshotSources;
	/** The site's icon on the band; without it a globe holds the place. */
	favicon?: string;
	/** The Fix files block, between the tiles and the sections, with its own top margin (report page only). */
	fixFiles?: ReactNode;
	/** A last row inside each category section (the Fix files footer). */
	categoryFooter?: (categoryId: string) => ReactNode;
	/** A row under a category's header, outside its panel (the Full check offer). */
	categoryAside?: (category: CategorySummary) => ReactNode;
	/** Replaces the score band (the running page draws its own). */
	band?: ReactNode;
	/** Shown under the action row while the audit runs (the queue messages). */
	notice?: ReactNode;
	/** Pieces that appear after the first render arrive animated. */
	animate?: boolean;
	now?: number;
}) {
	const complete = isComplete(result) ? result : null;
	const example = variant === "example";
	const band =
		bandOverride ??
		(complete ? (
			<ReportBand
				result={complete}
				example={example}
				tag={example ? "Example" : label}
				mode={mode}
				screenshot={screenshot}
				favicon={favicon}
				now={now}
			/>
		) : null);

	// A running audit lists its categories in the category order as they come in.
	const categories = complete
		? complete.categories
		: CATEGORIES.flatMap(
				({ id }) =>
					result.categories.find((category) => category.id === id) ?? [],
			);
	// Every category has a slot in the sections, waiting until it is in.
	const slots = complete
		? complete.categories.map((category) => ({
				id: category.id,
				title: category.title,
				category,
			}))
		: CATEGORIES.map(({ id, title }) => ({
				id,
				title,
				category: categories.find((category) => category.id === id),
			}));

	return (
		<article className="w-full">
			<ArrivalProvider animate={animate}>
				{band}
				<div className={example ? "" : "mx-auto w-full max-w-page px-4"}>
					{/* The action row is in place from the start (inert while the
					    audit runs), so it turns on at done without moving anything. */}
					{!example && (actions || !complete) ? (
						<Arrive present={Boolean(actions)} className="mt-4 min-h-[34px]">
							{actions}
							{!complete && notice ? (
								<div className={actions ? "mt-3" : undefined}>{notice}</div>
							) : null}
						</Arrive>
					) : null}
					<div className="mt-6">
						<CategoryTiles
							partial={!complete}
							categories={categories.map(({ id, title, status, score }) => ({
								id,
								title,
								status,
								score,
							}))}
						/>
					</div>
					{fixFiles}
					<div className="mt-6 space-y-3">
						{slots.map(({ id, title, category }) => {
							const heading = example ? "h4" : "h2";
							if (!category) {
								return (
									<Arrive key={id} present={false}>
										<WaitingSection id={id} title={title} heading={heading} />
									</Arrive>
								);
							}
							const summary = summarize(category);
							return (
								<Arrive key={id} present>
									<CategorySection
										category={summary}
										heading={heading}
										footer={complete ? categoryFooter?.(category.id) : null}
										aside={complete ? categoryAside?.(summary) : null}
										defaultOpen={
											defaultOpen === "problems" &&
											summary.warn + summary.fail > 0
										}
									>
										{category.checks.map((check) => (
											<CheckRow
												key={check.id}
												check={check}
												sectionReason={summary.skipReason}
											/>
										))}
									</CategorySection>
								</Arrive>
							);
						})}
						{/* A full check's crawl: waiting while it runs, after the
						    categories (the page's own) once the result is in. */}
						{complete?.crawl ? (
							<Arrive key="pages" present>
								<PagesSection
									crawl={complete.crawl}
									pageScore={complete.score}
									heading={example ? "h4" : "h2"}
								/>
							</Arrive>
						) : !complete && mode === "full" ? (
							<Arrive key="pages" present={false}>
								<WaitingPages heading={example ? "h4" : "h2"} />
							</Arrive>
						) : null}
						{/* Informational, after the scored categories; results stored
						    before it existed have no protocols and show nothing. */}
						{complete?.protocols ? (
							<Arrive key="protocols" present>
								<ProtocolsSection
									protocols={complete.protocols}
									heading={example ? "h4" : "h2"}
								/>
							</Arrive>
						) : null}
					</div>
				</div>
			</ArrivalProvider>
		</article>
	);
}
