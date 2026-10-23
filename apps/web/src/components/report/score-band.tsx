import type { AuditResult } from "@agentcheck/core";
import type { ReactNode } from "react";
import { SiteIcon } from "../site-icon";
import { BandGradeMark, BandScoreRing } from "./band-arrival";
import { Gauge } from "./gauge";
import { gradeStroke } from "./grade-mark";
import { headline } from "./headline";
import { ScoreConfetti } from "./score-confetti";
import { HALO, ScoreRing } from "./score-ring";
import { type ScreenshotSources, ScreenshotThumb } from "./screenshot-thumb";

export { gradeStroke, ScoreRing };

export function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

/**
 * The ring while an audit waits or runs: the same size and track as the score
 * ring, with a short arc turning round it (slowly while queued) and the status
 * inside, so the band keeps its place when the score arrives.
 */
export function PendingRing({ label, slow }: { label: string; slow: boolean }) {
	return (
		<Gauge
			value={22}
			arc="text-accent-fg"
			track="stroke-accent-fg/20"
			spin={
				slow
					? "motion-safe:animate-[spin_2.4s_linear_infinite]"
					: "motion-safe:animate-spin"
			}
			className={`${HALO} size-24 sm:size-32`}
		>
			<span className="text-sm font-semibold sm:text-base">{label}</span>
		</Gauge>
	);
}

/** The ring of a failed audit: the same size and halo, an empty track, "Failed" inside. */
export function FailedRing() {
	return (
		<Gauge
			value={0}
			arc="text-accent-fg"
			track="stroke-accent-fg/20"
			className={`${HALO} size-24 sm:size-32`}
		>
			<span className="text-lg leading-none font-extrabold tracking-tight text-band-fail sm:text-2xl">
				Failed
			</span>
		</Gauge>
	);
}

/**
 * The plum band at the top of a report: ring, host, chips, and the grade in the
 * brand frame, or with a screenshot the page's thumbnail with the grade as a seal.
 * Inside a report that animates arrivals (a band that appears when a watched
 * audit finishes) the ring pops and counts up, the grade fades in and the
 * thumbnail fades and rises in; anywhere else it is still.
 */
export function ScoreBand({
	result,
	chips,
	heading = "h1",
	className = "rounded-b-[22px]",
	surface = true,
	screenshot,
	favicon,
	celebrate = false,
}: {
	result: AuditResult;
	chips: ReactNode;
	heading?: "h1" | "h3";
	className?: string;
	/** false: no fill or padding of its own, for use inside a PlumBand. */
	surface?: boolean;
	screenshot?: ScreenshotSources;
	/** The site's icon beside the URL; without it a globe holds the place. */
	favicon?: string;
	/** Fire confetti from the ring (a full report that scores 100). */
	celebrate?: boolean;
}) {
	// A crawl leads with the site score; the page's own is in the Pages section.
	const lead = headline(result);
	const ring = (
		<BandScoreRing score={lead.score} grade={lead.grade} large={!surface} />
	);
	const Heading = heading;
	return (
		<section
			aria-label="Overall score"
			className={
				surface
					? `on-band relative bg-accent px-5 py-6 text-accent-fg sm:px-8 ${className}`
					: "relative text-accent-fg"
			}
		>
			{/* The thumbnail is wider than the grade mark: the host keeps its own row up to md. */}
			<div
				className={`grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-4 ${screenshot ? "md:grid-cols-[auto_1fr_auto]" : ""}`}
			>
				{celebrate ? <ScoreConfetti>{ring}</ScoreConfetti> : ring}
				<div
					className={`order-last col-span-2 min-w-0 ${screenshot ? "md:order-none md:col-span-1" : "sm:order-none sm:col-span-1 sm:flex sm:items-end sm:gap-5"}`}
				>
					<div className="min-w-0 flex-1">
						<Heading
							className={`font-bold tracking-tight text-balance break-all ${surface ? "text-2xl sm:text-3xl" : "text-3xl sm:text-5xl"}`}
						>
							{hostOf(result.target)}
						</Heading>
						<p className="mt-1 flex items-start gap-1.5 text-sm">
							<SiteIcon src={favicon} tone="band" />
							<a
								href={result.target}
								rel="noopener noreferrer nofollow"
								className="min-w-0 font-mono break-all text-accent-fg/85 underline decoration-accent-fg/40 underline-offset-4 hover:decoration-accent-fg"
							>
								{result.target}
							</a>
						</p>
						{result.finalUrl !== result.target ? (
							<p className="mt-0.5 text-xs break-all text-accent-fg/85">
								Redirected to{" "}
								<span className="font-mono">{result.finalUrl}</span>
							</p>
						) : null}
						<div className="mt-3 flex flex-wrap gap-1.5">{chips}</div>
					</div>
					{/* From sm up the grade sits at the end of the text, its frame's
					    bottom edge on the chips' baseline (the frame ends at 87.5% of
					    the mark's box, hence the nudge down). */}
					{screenshot ? null : (
						<BandGradeMark
							grade={lead.grade}
							className={`hidden shrink-0 translate-y-[12%] text-accent-fg sm:block ${surface ? "size-14" : "size-20"}`}
						/>
					)}
				</div>
				{screenshot ? (
					<ScreenshotThumb
						sources={screenshot}
						host={hostOf(result.target)}
						grade={lead.grade}
					/>
				) : (
					// On a phone the grade keeps its place beside the ring.
					<BandGradeMark
						grade={lead.grade}
						className={`justify-self-end text-accent-fg sm:hidden ${surface ? "size-14" : "size-16"}`}
					/>
				)}
			</div>
		</section>
	);
}
