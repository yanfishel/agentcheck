import type { AuditResult } from "@agentcheck/core";
import type { ReactNode } from "react";
import { HeroBackdrop } from "./landing/hero-backdrop";
import { PlumBand } from "./plum-band";
import {
	CategorySection,
	type CategorySummary,
} from "./report/category-section";
import { CategoryTiles } from "./report/category-tiles";
import { CheckRow } from "./report/check-row";
import type { CategoryResult } from "./report/markers";
import { relativeTime } from "./report/relative-time";
import { ScoreBand } from "./report/score-band";
import type { ScreenshotSources } from "./report/screenshot-thumb";
import { Chip, chipClass, Tooltip } from "./ui";

export { categoryMarker, checkMarker } from "./report/markers";

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

/**
 * Server component: a pure rendering of an audit result. `full` puts the score on
 * a full-width plum band (the page must not wrap it in a width container) and the
 * rest at page width; `example` is the landing's static sample: the same band on
 * a rounded card, an Example chip, lower heading levels, no actions.
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
	now = Date.now(),
}: {
	result: AuditResult;
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
	/** The Fix files block, between the tiles and the sections (report page only). */
	fixFiles?: ReactNode;
	/** A last row inside each category section (the Fix files footer). */
	categoryFooter?: (categoryId: string) => ReactNode;
	/** A row under a category's header, outside its panel (the Full check offer). */
	categoryAside?: (category: CategorySummary) => ReactNode;
	now?: number;
}) {
	const example = variant === "example";
	const tag = example ? "Example" : label;
	const chips = (
		<>
			{tag ? <Chip tone="band">{tag}</Chip> : null}
			{mode ? (
				<Chip tone="band">
					{mode === "full" ? "Full check" : "Quick check"}
				</Chip>
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
	const band = example ? (
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
			/>
		</PlumBand>
	);

	return (
		<article className="w-full">
			{band}
			<div className={example ? "" : "mx-auto w-full max-w-page px-4"}>
				{!example && actions ? <div className="mt-4">{actions}</div> : null}
				<div className="mt-6">
					<CategoryTiles
						categories={result.categories.map(
							({ id, title, status, score }) => ({
								id,
								title,
								status,
								score,
							}),
						)}
					/>
				</div>
				{fixFiles ? <div className="mt-6 empty:hidden">{fixFiles}</div> : null}
				<div className="mt-6 space-y-3">
					{result.categories.map((category) => {
						const summary = summarize(category);
						return (
							<CategorySection
								key={category.id}
								category={summary}
								heading={example ? "h4" : "h2"}
								footer={categoryFooter?.(category.id)}
								aside={categoryAside?.(summary)}
								defaultOpen={
									defaultOpen === "problems" && summary.warn + summary.fail > 0
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
						);
					})}
				</div>
			</div>
		</article>
	);
}
