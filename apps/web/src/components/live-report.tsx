"use client";

import type { AuditResult } from "@agentcheck/core";
import type { AuditMode } from "@agentcheck/db";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import type { AuditProgressData } from "../server/audit-access";
import type { FixFilesView } from "../server/fix-files";
import { AuditReport } from "./audit-report";
import { BrandMark } from "./brand-mark";
import { PlumBand } from "./plum-band";
import { ARRIVE_POP, useArrival } from "./report/arrival";
import { FixFilesFooter } from "./report/fix-files/footer";
import { FixFilesPanel } from "./report/fix-files/panel";
import {
	FixFilesProvider,
	type FixFilesRole,
} from "./report/fix-files/provider";
import { FullCheckOffer } from "./report/full-check-offer";
import { hostOf, PendingRing } from "./report/score-band";
import type { ScreenshotSources } from "./report/screenshot-thumb";
import { SiteIcon } from "./site-icon";
import { Card, Chip } from "./ui";

type ActiveStatus = "queued" | "running";

const POLL_INTERVAL_MS = 1000;
/** Polling stops after this long; the page then asks for a manual reload. */
const MAX_POLL_MS = 5 * 60_000;
/** A queued audit normally starts within seconds; past this the page explains the wait. */
export const QUEUE_STALL_MS = 30_000;

const statusLabel: Record<ActiveStatus, string> = {
	queued: "Queued",
	running: "Running",
};

const modeLabel: Record<AuditMode, string> = {
	quick: "Quick check",
	full: "Full check",
};

/** What the page builds on the server for a finished audit. */
export interface FinalReport {
	result: AuditResult;
	screenshot?: ScreenshotSources;
	favicon?: string;
	/** The action row (server-rendered `ReportActions`). */
	actions: ReactNode;
	/** The server's clock, for the band's relative time. */
	now: number;
}

/**
 * The audit page from queued to done: one `AuditReport` at one place, so the
 * tiles and sections that arrive while the audit runs stay the same elements
 * when it finishes. While queued or running it polls the audit's status, fills
 * in the categories that are complete, shows the site's icon once fetched and
 * the Fix files that the arrived categories call for (Generate waits); on done
 * or failed it refreshes the page, which hands it `final` (a failure renders
 * the failure view instead). Pieces arrive animated only if this page watched
 * the audit run: a report opened when done stays still.
 */
export function LiveReport({
	id,
	status: initialStatus,
	url,
	mode,
	queuedMs,
	final,
	fixFiles,
}: {
	id: string;
	status: ActiveStatus | "done";
	url: string;
	mode: AuditMode;
	/** How long the audit had been queued when the page rendered (server clock, so no skew). */
	queuedMs: number;
	/** The finished audit; set with `status === "done"`. */
	final?: FinalReport;
	fixFiles: { role: FixFilesRole; initial: FixFilesView };
}) {
	const router = useRouter();
	const done = initialStatus === "done" && final !== undefined;
	const [watched] = useState(!done);
	const [status, setStatus] = useState<ActiveStatus>(
		initialStatus === "queued" ? "queued" : "running",
	);
	const [progress, setProgress] = useState<AuditProgressData | null>(null);
	const [gone, setGone] = useState(false);
	const [gaveUp, setGaveUp] = useState(false);
	const [stalled, setStalled] = useState(
		initialStatus === "queued" && queuedMs > QUEUE_STALL_MS,
	);

	useEffect(() => {
		if (done) return;
		let cancelled = false;
		let polling = false;
		const startedAt = Date.now();
		const timer = setInterval(poll, POLL_INTERVAL_MS);

		function stop() {
			cancelled = true;
			clearInterval(timer);
		}

		async function poll() {
			if (Date.now() - startedAt > MAX_POLL_MS) {
				stop();
				setGaveUp(true);
				return;
			}
			if (polling) return;
			polling = true;
			try {
				const response = await fetch(`/api/audits/${id}`, {
					cache: "no-store",
					signal: AbortSignal.timeout(10_000),
				});
				if (cancelled) return;
				if (response.status === 404) {
					stop();
					setGone(true);
					return;
				}
				if (!response.ok) return;
				const body = (await response.json()) as {
					status?: unknown;
					progress?: AuditProgressData | null;
				};
				if (cancelled) return;
				if (body.status === "done" || body.status === "failed") {
					stop();
					router.refresh();
				} else if (body.status === "queued" || body.status === "running") {
					setStatus(body.status);
					if (body.progress) setProgress(body.progress);
					setStalled(
						body.status === "queued" &&
							queuedMs + Date.now() - startedAt > QUEUE_STALL_MS,
					);
				}
			} catch {
				// A transient network error or an aborted (timed out) request; the next tick retries.
			} finally {
				polling = false;
			}
		}

		return stop;
	}, [done, id, router, queuedMs]);

	if (gone) {
		return (
			<div className="mx-auto w-full max-w-page px-4 pt-8">
				<Card className="p-6">
					<div aria-live="polite">
						<h1 className="text-2xl font-bold tracking-tight">
							This audit is no longer available
						</h1>
						<p className="mt-3 break-all font-mono text-sm text-muted">{url}</p>
					</div>
				</Card>
			</div>
		);
	}

	const favicon = progress?.hasFavicon
		? `/api/audits/${id}/favicon`
		: undefined;

	return (
		<FixFilesProvider
			auditId={id}
			url={url}
			finalUrl={final?.result.finalUrl ?? url}
			mode={mode}
			role={fixFiles.role}
			initial={
				done
					? fixFiles.initial
					: { ...fixFiles.initial, kinds: progress?.fixKinds ?? [] }
			}
			pending={!done}
		>
			{done ? (
				<AuditReport
					result={final.result}
					mode={mode}
					screenshot={final.screenshot}
					favicon={final.favicon}
					fixFiles={<FixFilesPanel />}
					categoryFooter={(categoryId) => (
						<FixFilesFooter categoryId={categoryId} />
					)}
					categoryAside={(category) =>
						mode === "quick" && category.status === "skipped" ? (
							<FullCheckOffer auditId={id} url={url} />
						) : null
					}
					actions={final.actions}
					animate={watched}
					now={final.now}
				/>
			) : (
				<AuditReport
					result={{ target: url, categories: progress?.categories ?? [] }}
					mode={mode}
					fixFiles={<FixFilesPanel />}
					band={
						<LiveBand status={status} url={url} mode={mode} favicon={favicon} />
					}
					notice={
						gaveUp ? (
							<p role="status" className="text-sm">
								This is taking longer than expected. Reload the page to check
								again.
							</p>
						) : stalled ? (
							<p role="status" className="text-sm">
								This audit is waiting in the queue longer than usual. It starts
								as soon as a slot frees up; you can leave this page and come
								back with the same link.
							</p>
						) : null
					}
					animate
				/>
			)}
		</FixFilesProvider>
	);
}

/**
 * The band while the audit waits or runs: the ring spins where the score
 * goes, the mark waits where the grade or the thumbnail goes, and the site's
 * icon pops in over the globe once the audit has it.
 */
function LiveBand({
	status,
	url,
	mode,
	favicon,
}: {
	status: ActiveStatus;
	url: string;
	mode: AuditMode;
	favicon?: string;
}) {
	const iconArrived = useArrival(favicon !== undefined);
	return (
		<PlumBand>
			<section className="relative text-accent-fg">
				<div className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-4 sm:grid-cols-[auto_1fr_auto]">
					<div aria-live="polite">
						<PendingRing
							label={statusLabel[status]}
							slow={status === "queued"}
						/>
					</div>
					<div className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
						<h1 className="text-3xl font-bold tracking-tight text-balance break-all sm:text-5xl">
							{hostOf(url)}
						</h1>
						<p className="mt-1 flex items-start gap-1.5 font-mono text-sm text-accent-fg/85">
							<span
								className={`inline-flex ${iconArrived ? ARRIVE_POP : ""}`.trim()}
							>
								<SiteIcon src={favicon} tone="band" />
							</span>
							<span className="min-w-0 break-all">{url}</span>
						</p>
						<div className="mt-3 flex flex-wrap gap-1.5">
							<Chip tone="band">{modeLabel[mode]}</Chip>
						</div>
					</div>
					<BrandMark
						state={status}
						className="size-20 justify-self-end text-accent-fg/85 sm:size-24"
					/>
				</div>
			</section>
		</PlumBand>
	);
}
