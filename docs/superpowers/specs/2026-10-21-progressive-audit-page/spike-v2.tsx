"use client";
// THROWAWAY SPIKE v2: everything in place from the start, filled in as it arrives. Not for commit.

import { CATEGORIES, gradeFor } from "@agentcheck/core/scoring";
import { ChevronDown, Download, Share2, ShieldCheck, Wand } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { CATEGORY_META, CategoryIcon } from "@/components/category-meta";
import { PlumBand } from "@/components/plum-band";
import {
	CategorySection,
	openCategory,
} from "@/components/report/category-section";
import { CheckRow } from "@/components/report/check-row";
import { Gauge } from "@/components/report/gauge";
import { categoryTone, toneText } from "@/components/report/markers";
import { PendingRing, ScoreRing } from "@/components/report/score-band";
import { SiteIcon } from "@/components/site-icon";
import { Button, Chip } from "@/components/ui";

type Scenario = "errors" | "perfect";
type Id = (typeof CATEGORIES)[number]["id"];

const SCORES: Record<Scenario, Record<Id, number>> = {
	errors: {
		"ai-manifests": 0,
		"bot-access": 100,
		"content-semantics": 50,
		"agentic-actionability": 89,
	},
	perfect: {
		"ai-manifests": 100,
		"bot-access": 100,
		"content-semantics": 100,
		"agentic-actionability": 100,
	},
};
const WEIGHTS: Record<Id, number> = {
	"ai-manifests": 0.3,
	"bot-access": 0.2,
	"content-semantics": 0.25,
	"agentic-actionability": 0.25,
};
/** When each piece "arrives", ms from start. */
const AT: Record<string, number> = {
	favicon: 900,
	"ai-manifests": 1600,
	"bot-access": 2300,
	"content-semantics": 3100,
	"agentic-actionability": 8000,
	done: 8700,
};
const STATIC: Id[] = ["ai-manifests", "bot-access", "content-semantics"];

const gaugeFill: Record<string, string> = {
	pass: "fill-pass-soft",
	warn: "fill-warn-soft",
	fail: "fill-fail-soft",
};

function statusOf(score: number) {
	return score >= 90 ? "pass" : score >= 50 ? "warn" : "fail";
}

function useCountUp(target: number | null, ms = 700) {
	const [value, setValue] = useState(0);
	useEffect(() => {
		if (target === null) {
			setValue(0);
			return;
		}
		let raf = 0;
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / ms);
			setValue(Math.round(target * (1 - (1 - t) ** 3)));
			if (t < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [target, ms]);
	return value;
}

function Tile({ id, score }: { id: Id; score: number | null }) {
	const shown = useCountUp(score);
	const Icon = CATEGORY_META[id].icon;
	const status = statusOf(score ?? 100);
	const tone = categoryTone({ status, score: score ?? 0 } as never);
	const title = CATEGORIES.find((c) => c.id === id)?.title;
	return (
		<li
			className="flex flex-col items-center justify-center rounded-[14px] border border-line bg-surface px-3 py-4 text-center shadow-card"
			style={
				score === null
					? undefined
					: { animation: "spike-pop 520ms cubic-bezier(.2,.9,.3,1.3)" }
			}
		>
			{score === null ? (
				<Gauge
					value={0}
					arc=""
					track="stroke-line-soft"
					fill="fill-surface-2"
					className="size-20 motion-safe:animate-pulse"
				/>
			) : (
				<Gauge
					value={shown}
					arc={toneText[tone]}
					track="stroke-line-soft"
					fill={gaugeFill[status]}
					className="size-20"
				>
					<span
						className={`text-2xl leading-none font-extrabold tracking-tight tabular-nums ${toneText[tone]}`}
					>
						{shown}
					</span>
				</Gauge>
			)}
			<span className="mt-3 text-center text-xs leading-5 font-semibold text-balance text-muted">
				<Icon
					aria-hidden="true"
					className={`mr-1.5 inline size-4 align-[-4px] ${CATEGORY_META[id].text}`}
				/>
				{title}
			</span>
		</li>
	);
}

/** A section row waiting for its category: icon and title, a pulsing chip, a faded chevron. */
function WaitingSection({ id }: { id: Id }) {
	const title = CATEGORIES.find((c) => c.id === id)?.title;
	return (
		<section className="rounded-[14px] border border-line bg-surface px-4 py-1 shadow-card">
			<div className="flex items-center gap-3 py-2.5">
				<span className="flex min-w-0 flex-auto items-center gap-3">
					<CategoryIcon id={id} size="sm" />
					<span className="font-bold">{title}</span>
				</span>
				<span className="h-6 w-16 rounded-full bg-surface-2 motion-safe:animate-pulse" />
				<ChevronDown aria-hidden="true" className="size-4 text-muted/40" />
			</div>
		</section>
	);
}

function ArrivedSection({ id, score }: { id: Id; score: number }) {
	const title = CATEGORIES.find((c) => c.id === id)?.title ?? "";
	const status = statusOf(score);
	const problems = status !== "pass";
	// Mount closed, then open: the accordion animates its height like a click.
	useEffect(() => {
		if (!problems) return;
		const t = setTimeout(() => openCategory(id), 60);
		return () => clearTimeout(t);
	}, [id, problems]);
	const checks = [
		{
			id: `${id}-a`,
			title: "First check",
			weight: 1,
			status: status === "pass" ? "pass" : "fail",
			message:
				status === "pass"
					? "Looks good"
					: "Something is missing here (demo text)",
			remediation:
				status === "pass" ? undefined : "How to fix it would be here.",
		},
		{
			id: `${id}-b`,
			title: "Second check",
			weight: 1,
			status: status === "warn" ? "warn" : "pass",
			message: status === "warn" ? "Partly done (demo text)" : "Looks good",
		},
		{
			id: `${id}-c`,
			title: "Third check",
			weight: 1,
			status: "pass",
			message: "Looks good",
		},
	] as never[];
	return (
		<div style={{ animation: "spike-glow 600ms ease-out" }}>
			<CategorySection
				category={{
					id,
					title,
					status: "scored",
					score,
					skipReason: null,
					checks: 3,
					warn: status === "warn" ? 1 : 0,
					fail: status === "fail" ? 1 : 0,
				}}
				heading="h2"
				defaultOpen={false}
			>
				{checks.map((check: { id: string }) => (
					<CheckRow key={check.id} check={check as never} />
				))}
			</CategorySection>
		</div>
	);
}

export function Spike() {
	const [run, setRun] = useState(0);
	const [t, setT] = useState(0);
	const [scenario, setScenario] = useState<Scenario>("errors");

	useEffect(() => {
		setT(0);
		const start = performance.now();
		const timer = setInterval(() => setT(performance.now() - start), 50);
		return () => clearInterval(timer);
	}, [run]);

	const scores = SCORES[scenario];
	const has = (key: string) => t >= (AT[key] ?? Number.POSITIVE_INFINITY);
	const done = has("done");
	const total = Math.round(
		CATEGORIES.reduce((sum, { id }) => sum + scores[id] * WEIGHTS[id], 0),
	);
	const grade = gradeFor(total);
	const ringValue = useCountUp(done ? total : null, 900);

	// Fix files: known once the static categories are in.
	const staticIn = STATIC.filter((id) => has(id));
	const fixNeeded = staticIn.some((id) => statusOf(scores[id]) !== "pass");
	const allStaticIn = staticIn.length === STATIC.length;
	const fixCollapsed = allStaticIn && !fixNeeded;
	const fixFiles = [
		statusOf(scores["ai-manifests"]) !== "pass" &&
			has("ai-manifests") &&
			"llms.txt, llms-full.txt",
		statusOf(scores["content-semantics"]) !== "pass" &&
			has("content-semantics") &&
			"head tags",
	].filter(Boolean);

	const actionsReady = done;

	return (
		<div>
			<style>{`
				@keyframes spike-pop { 0% { transform: scale(.94); opacity: .4 } 100% { transform: scale(1); opacity: 1 } }
				@keyframes spike-glow { 0% { opacity: .55 } 100% { opacity: 1 } }
			`}</style>
			<PlumBand>
				<section className="relative text-accent-fg">
					<div className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-4 sm:grid-cols-[auto_1fr_auto]">
						<div>
							{done ? (
								<div style={{ animation: "spike-pop 520ms ease-out" }}>
									<ScoreRing score={ringValue} grade={grade} large />
								</div>
							) : (
								<PendingRing label="Running" slow={false} />
							)}
						</div>
						<div className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
							<h1 className="text-3xl font-bold tracking-tight text-balance break-all sm:text-5xl">
								example.com
							</h1>
							<p className="mt-1 flex items-start gap-1.5 font-mono text-sm text-accent-fg/85">
								<SiteIcon tone="band" />
								<span className="min-w-0 break-all">https://example.com/</span>
							</p>
							<div className="mt-3 flex flex-wrap gap-1.5">
								<Chip tone="band">Full check</Chip>
							</div>
						</div>
						<BrandMark
							state={done ? "done" : "running"}
							className="size-20 justify-self-end text-accent-fg/85 sm:size-24"
						/>
					</div>
				</section>
			</PlumBand>
			<div className="mx-auto w-full max-w-page px-4 pb-10">
				{/* Demo controls */}
				<div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-2 text-sm">
					<span className="text-muted">Демо:</span>
					<button
						type="button"
						onClick={() => setRun((r) => r + 1)}
						className="rounded-lg bg-accent px-3 py-1 font-semibold text-accent-fg"
					>
						Ещё раз
					</button>
					{(["errors", "perfect"] as const).map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => {
								setScenario(s);
								setRun((r) => r + 1);
							}}
							className={`rounded-lg border px-3 py-1 ${scenario === s ? "border-accent font-semibold text-accent" : "border-line"}`}
						>
							{s === "errors" ? "Сайт с ошибками" : "Сайт на 100"}
						</button>
					))}
					<span className="ml-auto tabular-nums text-muted">
						{(t / 1000).toFixed(1)} s
					</span>
				</div>

				{/* Actions: in place from the start, faded and inactive until done. */}
				<div
					className={`mt-4 flex min-h-[34px] flex-wrap gap-2 transition-opacity duration-500 ${actionsReady ? "" : "pointer-events-none opacity-45"}`}
					aria-disabled={!actionsReady}
				>
					<Button
						variant="primary"
						size="sm"
						icon={<Share2 aria-hidden="true" className="size-4" />}
					>
						Share
					</Button>
					<Button
						variant="secondary"
						size="sm"
						icon={<ShieldCheck aria-hidden="true" className="size-4" />}
					>
						Get badge
					</Button>
					<Button
						variant="secondary"
						size="sm"
						icon={<Download aria-hidden="true" className="size-4" />}
					>
						Export
					</Button>
				</div>

				<ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
					{CATEGORIES.map(({ id }) => (
						<Tile
							key={`${run}-${id}`}
							id={id}
							score={has(id) ? scores[id] : null}
						/>
					))}
				</ul>

				{/* Fix files: waiting from the start; collapses if there is nothing to fix. */}
				<div
					key={`fix-${run}`}
					className="grid transition-[grid-template-rows,opacity,margin] duration-500 ease-out"
					style={{
						gridTemplateRows: fixCollapsed ? "0fr" : "1fr",
						opacity: fixCollapsed ? 0 : 1,
						marginTop: fixCollapsed ? 0 : "1.5rem",
					}}
				>
					<div className="overflow-hidden">
						<section className="rounded-[14px] border border-line bg-surface p-5 shadow-card">
							<div className="flex flex-wrap items-start gap-x-4 gap-y-3">
								<span
									className={`grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-500 ${fixFiles.length ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}
								>
									<Wand aria-hidden="true" className="size-5" />
								</span>
								<div className="min-w-0 flex-1 basis-60">
									<h2
										className={`text-lg font-bold ${fixFiles.length ? "" : "text-muted"}`}
									>
										Fix files
									</h2>
									{fixFiles.length ? (
										<p className="mt-1 text-sm text-muted">
											{fixFiles.join(" and ")} built from your site's own pages.
											{done ? null : " Available when the check finishes."}
										</p>
									) : (
										<span className="mt-2 block h-4 w-64 max-w-full rounded bg-surface-2 motion-safe:animate-pulse" />
									)}
								</div>
								<Button
									variant="primary"
									size="sm"
									disabled={!done || !fixFiles.length}
									icon={<Wand aria-hidden="true" className="size-4" />}
								>
									Generate fix files
								</Button>
							</div>
						</section>
					</div>
				</div>

				{/* Sections: all four from the start; open on arrival when there are problems. */}
				<div className="mt-6 space-y-3">
					{CATEGORIES.map(({ id }) =>
						has(id) ? (
							<ArrivedSection
								key={`${run}-${id}-in`}
								id={id}
								score={scores[id]}
							/>
						) : (
							<WaitingSection key={`${run}-${id}-wait`} id={id} />
						),
					)}
				</div>
			</div>
		</div>
	);
}
