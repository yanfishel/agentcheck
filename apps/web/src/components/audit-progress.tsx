"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "./brand-mark";
import { PlumBand } from "./plum-band";
import { PendingTiles } from "./report/category-tiles";
import { hostOf, PendingRing } from "./report/score-band";
import { SiteIcon } from "./site-icon";
import { Card, Chip } from "./ui";

type ActiveStatus = "queued" | "running";

const POLL_INTERVAL_MS = 1500;
/** Polling stops after this long; the page then asks for a manual reload. */
const MAX_POLL_MS = 5 * 60_000;
/** A queued audit normally starts within seconds; past this the page explains the wait. */
export const QUEUE_STALL_MS = 30_000;

const statusLabel: Record<ActiveStatus, string> = {
	queued: "Queued",
	running: "Running",
};

const modeLabel: Record<"quick" | "full", string> = {
	quick: "Quick check",
	full: "Full check",
};

export function AuditProgress(props: {
	id: string;
	status: ActiveStatus;
	url: string;
	mode: "quick" | "full";
	/** How long the audit had been queued when the page rendered (server clock, so no skew). */
	queuedMs: number;
}) {
	const { id, url, mode, queuedMs } = props;
	const router = useRouter();
	const [status, setStatus] = useState<ActiveStatus>(props.status);
	const [gone, setGone] = useState(false);
	const [gaveUp, setGaveUp] = useState(false);
	const [stalled, setStalled] = useState(
		props.status === "queued" && queuedMs > QUEUE_STALL_MS,
	);

	useEffect(() => {
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
				const body = (await response.json()) as { status?: unknown };
				if (cancelled) return;
				if (body.status === "done" || body.status === "failed") {
					stop();
					router.refresh();
				} else if (body.status === "queued" || body.status === "running") {
					setStatus(body.status);
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
	}, [id, router, queuedMs]);

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

	return (
		<div>
			{/* The report's band and tiles with nothing filled in yet: the ring spins
			    where the score goes, the mark waits where the grade goes. */}
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
								<SiteIcon tone="band" />
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
			<div className="mx-auto w-full max-w-page px-4">
				{/* Holds the place of the report's action row, so the tiles do not move. */}
				<div className="mt-4 min-h-[34px]">
					{stalled && !gaveUp && (
						<p role="status" className="text-sm">
							This audit is waiting in the queue longer than usual. It starts as
							soon as a slot frees up; you can leave this page and come back
							with the same link.
						</p>
					)}
					{gaveUp && (
						<p role="status" className="text-sm">
							This is taking longer than expected. Reload the page to check
							again.
						</p>
					)}
				</div>
				<div className="mt-6">
					<PendingTiles />
				</div>
			</div>
		</div>
	);
}
