import { countUserSites, listUserHistory } from "@agentcheck/db";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { HistoryThumb } from "../../components/history-thumb";
import { GradeMark } from "../../components/report/grade-mark";
import { relativeTime } from "../../components/report/relative-time";
import { RerunButton } from "../../components/rerun-button";
import { SiteIcon } from "../../components/site-icon";
import {
	Card,
	Chip,
	type ChipTone,
	Collapsible,
	chipClass,
	EmptyState,
	Pagination,
	statusTone,
	Tooltip,
} from "../../components/ui";
import { getDb } from "../../server/current-user";
import { requireActiveUser } from "../../server/guards";
import {
	groupAuditsByUrl,
	type HistoryGroup,
	type HistoryRun,
	scoreTrend,
} from "../../server/history";
import { pageWindow } from "../../server/paging";

export const dynamic = "force-dynamic";

/** Sites per page. */
const PAGE_SIZE = 10;

export const metadata: Metadata = {
	title: "History — AgentCheck",
	robots: { index: false },
};

/** Numbers and days at most, as the list has always read ("1 day ago", "30 days ago"). */
const relativeDate = (date: Date, now: number) =>
	relativeTime(date, now, { numeric: "always", maxUnit: "day" });

const absoluteDate = (date: Date) =>
	`${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** pass >= 90, warn >= 50, fail otherwise (the report's tile rule). */
function scoreTone(score: number): ChipTone {
	if (score >= 90) return "pass";
	if (score >= 50) return "warn";
	return "fail";
}

const modeLabel = (run: HistoryRun) =>
	run.mode === "full" ? "Full check" : "Quick check";

const scored = (run: HistoryRun): run is HistoryRun & { score: number } =>
	run.status === "done" && run.score !== null;

const GRADES = ["A+", "A", "B", "C", "D", "F"] as const;
type Grade = (typeof GRADES)[number];
const isGrade = (grade: string | null): grade is Grade =>
	GRADES.includes(grade as Grade);

/**
 * The latest run's grade as a stamp: the grade mark on a plum tile (plum in both
 * themes, like the report band's seal). Unscored runs show a dash; the score
 * itself is a chip beside it. `compact` is the stamp over a picture's corner.
 */
function GradeStamp({
	run,
	compact = false,
}: {
	run: HistoryRun;
	compact?: boolean;
}) {
	const box = compact ? "size-9 rounded-[9px]" : "size-14 rounded-[14px]";
	if (!scored(run) || !isGrade(run.grade)) {
		return (
			<div
				className={`grid shrink-0 place-items-center bg-surface-2 text-muted ${box}`}
			>
				<span className="font-mono font-bold" aria-hidden="true">
					–
				</span>
			</div>
		);
	}
	return (
		<div
			className={`on-band relative shrink-0 bg-accent text-accent-fg ${box} ${compact ? "shadow-thumb" : ""}`}
		>
			{/* The frame fills the tile's middle; the spark reaches past its corner. */}
			<div className="absolute inset-[12%]">
				<GradeMark
					grade={run.grade}
					stamp
					className="size-full text-accent-fg"
				/>
			</div>
		</div>
	);
}

function TimeChip({ date, now }: { date: Date; now: number }) {
	return (
		<Tooltip content={absoluteDate(date)}>
			<button type="button" className={`${chipClass("muted")} cursor-default`}>
				<time dateTime={date.toISOString()}>{relativeDate(date, now)}</time>
			</button>
		</Tooltip>
	);
}

function PreviousRuns({ runs, now }: { runs: HistoryRun[]; now: number }) {
	const label = `${runs.length} previous ${runs.length === 1 ? "run" : "runs"}`;
	return (
		<div className="border-t border-line-soft px-5 py-1">
			<Collapsible
				trigger={<span className="text-sm font-semibold">{label}</span>}
			>
				<ul className="flex flex-col pb-3">
					{runs.map((run) => (
						<li
							key={run.id}
							className="flex flex-wrap items-center gap-2 border-t border-line-soft py-2 first:border-t-0"
						>
							<Link
								href={`/audits/${run.id}`}
								className="rounded-full focus-visible:outline-2 outline-accent outline-offset-2"
							>
								{scored(run) ? (
									<Chip tone={scoreTone(run.score)}>
										{run.score}
										{run.grade ? ` ${run.grade}` : ""}
									</Chip>
								) : (
									<Chip tone={statusTone(run.status)}>{run.status}</Chip>
								)}
							</Link>
							<Chip>{modeLabel(run)}</Chip>
							<span className="text-sm text-muted">
								<time dateTime={run.createdAt.toISOString()}>
									{relativeDate(run.createdAt, now)}
								</time>
							</span>
						</li>
					))}
				</ul>
			</Collapsible>
		</div>
	);
}

function SiteCard({ group, now }: { group: HistoryGroup; now: number }) {
	const { latest } = group;
	const trend = scoreTrend(latest.score, group.previousScore);
	const older = group.runs.slice(1);
	return (
		<Card as="article">
			<div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
				{/* A screenshot stacks above the text on a phone; without one the
				    phone keeps the plain seal beside the text. */}
				<div
					className={`flex min-w-0 flex-1 gap-4 ${group.screenshotId ? "flex-col sm:flex-row" : ""}`}
				>
					<HistoryThumb
						screenshotId={group.screenshotId}
						faviconSrc={
							group.faviconId
								? `/api/audits/${group.faviconId}/favicon`
								: undefined
						}
						href={`/audits/${latest.id}`}
					>
						<GradeStamp run={latest} compact />
					</HistoryThumb>
					{group.screenshotId ? null : (
						<div className="sm:hidden">
							<GradeStamp run={latest} />
						</div>
					)}
					<div className="min-w-0 flex-1">
						<h2 className="text-lg font-bold tracking-tight">
							<Link
								href={`/audits/${latest.id}`}
								className="break-all hover:underline focus-visible:outline-2 outline-accent outline-offset-2"
							>
								{group.host}
							</Link>
						</h2>
						<p className="flex items-center gap-1.5 font-mono text-xs text-muted">
							<SiteIcon
								src={
									group.faviconId
										? `/api/audits/${group.faviconId}/favicon`
										: undefined
								}
								tone="card"
							/>
							<span className="min-w-0 truncate">{group.url}</span>
						</p>
						<div className="mt-3 flex flex-wrap items-center gap-1.5">
							{scored(latest) ? (
								<Chip tone={scoreTone(latest.score)}>{latest.score}/100</Chip>
							) : (
								<Chip tone={statusTone(latest.status)}>{latest.status}</Chip>
							)}
							{trend ? <Chip tone={trend.tone}>{trend.label}</Chip> : null}
							<Chip>{modeLabel(latest)}</Chip>
							<TimeChip date={latest.createdAt} now={now} />
						</div>
					</div>
				</div>
				<div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
					<RerunButton
						url={group.url}
						mode={latest.mode}
						label={`Run again for ${group.host}`}
					/>
					{latest.mode === "quick" ? (
						<RerunButton
							url={group.url}
							mode="full"
							upgrade
							label={`Run a full check for ${group.host}`}
						/>
					) : null}
				</div>
			</div>
			{older.length > 0 ? <PreviousRuns runs={older} now={now} /> : null}
		</Card>
	);
}

export default async function HistoryPage({
	searchParams,
}: PageProps<"/history">) {
	await auth.protect();
	const user = await requireActiveUser();
	const db = getDb();
	const { page, pages, offset } = pageWindow(
		(await searchParams).page,
		await countUserSites(db, user.id),
		PAGE_SIZE,
	);
	const groups = groupAuditsByUrl(
		await listUserHistory(db, user.id, { limit: PAGE_SIZE, offset }),
	);
	const now = Date.now();
	return (
		<main className="mx-auto w-full max-w-page px-4 pt-10 pb-16">
			<h1 className="text-3xl font-bold tracking-tight text-balance">
				History
			</h1>
			<p className="mt-1 text-muted">Your audits by site, newest first.</p>
			<div className="mt-6">
				{groups.length === 0 ? (
					<EmptyState
						title="No audits yet"
						text="Audits you start while signed in show up here, grouped by site."
						action={
							<Link
								href="/"
								className="font-semibold text-accent underline underline-offset-4"
							>
								Start one from the home page
							</Link>
						}
					/>
				) : (
					<ul className="flex flex-col gap-4">
						{groups.map((group) => (
							<li key={group.url}>
								<SiteCard group={group} now={now} />
							</li>
						))}
					</ul>
				)}
			</div>
			<Pagination page={page} pages={pages} path="/history" />
		</main>
	);
}
