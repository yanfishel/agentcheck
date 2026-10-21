import "server-only";
import type { Audit, AuditMode, AuditStatus } from "@agentcheck/db";

const MAX_RUNS = 5;

export interface HistoryRun {
	id: string;
	mode: AuditMode;
	status: AuditStatus;
	score: number | null;
	grade: string | null;
	createdAt: Date;
}

export interface HistoryGroup {
	url: string;
	host: string;
	latest: HistoryRun;
	previousScore: number | null;
	/** The newest listed audit with a screenshot, which may be older than `latest`. */
	screenshotId: string | null;
	/** The newest listed audit with a site icon, independent of `screenshotId`. */
	faviconId: string | null;
	runs: HistoryRun[];
}

/** Groups audits (newest first) by url; groups keep the order of their newest audit. */
export function groupAuditsByUrl(audits: Audit[]): HistoryGroup[] {
	const groups = new Map<
		string,
		{
			host: string;
			all: HistoryRun[];
			screenshotId: string | null;
			faviconId: string | null;
		}
	>();
	for (const audit of audits) {
		const run: HistoryRun = {
			id: audit.id,
			mode: audit.mode,
			status: audit.status,
			score: audit.score,
			grade: audit.grade,
			createdAt: audit.createdAt,
		};
		const group = groups.get(audit.url);
		const shot = audit.hasScreenshot ? audit.id : null;
		// A running audit may already have its favicon; history shows finished data only.
		const icon = audit.status === "done" && audit.hasFavicon ? audit.id : null;
		if (group) {
			group.all.push(run);
			group.screenshotId ??= shot;
			group.faviconId ??= icon;
		} else {
			groups.set(audit.url, {
				host: audit.host,
				all: [run],
				screenshotId: shot,
				faviconId: icon,
			});
		}
	}
	const result: HistoryGroup[] = [];
	for (const [url, { host, all, screenshotId, faviconId }] of groups) {
		const [latest] = all;
		if (!latest) continue;
		const done = all.filter((run) => run.status === "done");
		result.push({
			url,
			host,
			latest,
			previousScore: done[1]?.score ?? null,
			screenshotId,
			faviconId,
			runs: all.slice(0, MAX_RUNS),
		});
	}
	return result;
}

export function scoreTrend(
	latest: number | null,
	previous: number | null,
): { label: string; tone: "pass" | "fail" | "muted" } | null {
	if (latest === null || previous === null) return null;
	const delta = latest - previous;
	if (delta > 0) return { label: `+${delta} since last run`, tone: "pass" };
	if (delta < 0) return { label: `−${-delta} since last run`, tone: "fail" };
	return { label: "Same as last run", tone: "muted" };
}
