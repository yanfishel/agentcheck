"use client";
// THROWAWAY SPIKE: a live demo of the progressive audit page. Not for commit.

import { CATEGORIES, gradeFor } from "@agentcheck/core/scoring";
import { Wand } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { CATEGORY_META } from "@/components/category-meta";
import { PlumBand } from "@/components/plum-band";
import { CategorySection } from "@/components/report/category-section";
import { Gauge } from "@/components/report/gauge";
import { GradeMark } from "@/components/report/grade-mark";
import { categoryTone, toneText } from "@/components/report/markers";
import { PendingRing, ScoreRing } from "@/components/report/score-band";
import { ScreenshotThumb } from "@/components/report/screenshot-thumb";
import { SiteIcon } from "@/components/site-icon";
import { Button, Chip } from "@/components/ui";

const TOKEN = "ogcheck0123456789abcdefg";
const URL_ = "https://atarcms.com/";
const SCORES: Record<string, number> = {
	"ai-manifests": 100,
	"bot-access": 85,
	"content-semantics": 72,
	"agentic-actionability": 64,
};
const WEIGHTS: Record<string, number> = {
	"ai-manifests": 0.3,
	"bot-access": 0.2,
	"content-semantics": 0.25,
	"agentic-actionability": 0.25,
};
/** When each piece "arrives", ms from start. */
const TIMELINE = {
	favicon: 900,
	"ai-manifests": 1600,
	"bot-access": 2300,
	"content-semantics": 3100,
	"agentic-actionability": 8000,
	screenshot: 8000,
	done: 8700,
} as Record<string, number>;

const gaugeFill: Record<string, string> = {
	pass: "fill-pass-soft",
	warn: "fill-warn-soft",
	fail: "fill-fail-soft",
};

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
			const eased = 1 - (1 - t) ** 3;
			setValue(Math.round(target * eased));
			if (t < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [target, ms]);
	return value;
}

function Tile({
	id,
	title,
	score,
	loader,
}: {
	id: string;
	title: string;
	score: number | null;
	loader: "spin" | "pulse";
}) {
	const shown = useCountUp(score);
	const Icon = CATEGORY_META[id as keyof typeof CATEGORY_META].icon;
	const status =
		score === null
			? "pass"
			: score >= 90
				? "pass"
				: score >= 50
					? "warn"
					: "fail";
	const tone = categoryTone({ status, score: score ?? 0 } as never);
	return (
		<li
			className={`flex flex-col items-center justify-center rounded-[14px] border bg-surface px-3 py-4 text-center shadow-card transition-all duration-500 ${score === null ? "border-line" : "border-line"}`}
			style={
				score === null
					? undefined
					: { animation: "spike-pop 520ms cubic-bezier(.2,.9,.3,1.3)" }
			}
		>
			{score === null ? (
				loader === "spin" ? (
					<Gauge
						value={22}
						arc="text-accent"
						track="stroke-line-soft"
						fill="fill-surface-2"
						spin="motion-safe:animate-spin"
						className="size-20"
					/>
				) : (
					<Gauge
						value={0}
						arc=""
						track="stroke-line-soft"
						fill="fill-surface-2"
						className="size-20 motion-safe:animate-pulse"
					/>
				)
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
					className={`mr-1.5 inline size-4 align-[-4px] ${CATEGORY_META[id as keyof typeof CATEGORY_META].text}`}
				/>
				{title}
			</span>
		</li>
	);
}

export function Spike() {
	const [run, setRun] = useState(0);
	const [t, setT] = useState(0);
	const [loader, setLoader] = useState<"spin" | "pulse">("pulse");

	useEffect(() => {
		setT(0);
		const start = performance.now();
		const timer = setInterval(() => setT(performance.now() - start), 50);
		return () => clearInterval(timer);
	}, [run]);

	const has = (key: string) => t >= TIMELINE[key];
	const done = has("done");
	const total = Math.round(
		Object.entries(SCORES).reduce((sum, [k, v]) => sum + v * WEIGHTS[k], 0),
	);
	const grade = gradeFor(total);
	const ringValue = useCountUp(done ? total : null, 900);

	return (
		<div>
			<style>{`
				@keyframes spike-pop { 0% { transform: scale(.94); opacity: .4 } 100% { transform: scale(1); opacity: 1 } }
				@keyframes spike-fade { 0% { transform: translateY(4px); opacity: 0 } 100% { transform: none; opacity: 1 } }
			`}</style>
			<PlumBand>
				<section className="relative text-accent-fg">
					<div className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-4 md:grid-cols-[auto_1fr_auto]">
						<div aria-live="polite">
							{done ? (
								<div style={{ animation: "spike-pop 520ms ease-out" }}>
									<ScoreRing score={ringValue} grade={grade} large />
								</div>
							) : (
								<PendingRing label="Running" slow={false} />
							)}
						</div>
						<div className="order-last col-span-2 min-w-0 md:order-none md:col-span-1">
							<h1 className="text-3xl font-bold tracking-tight text-balance break-all sm:text-5xl">
								atarcms.com
							</h1>
							<p className="mt-1 flex items-start gap-1.5 font-mono text-sm text-accent-fg/85">
								<span
									key={has("favicon") ? "icon" : "globe"}
									style={
										has("favicon")
											? { animation: "spike-pop 420ms ease-out" }
											: undefined
									}
									className="inline-flex"
								>
									<SiteIcon
										tone="band"
										src={
											has("favicon")
												? `/api/shared/${TOKEN}/favicon`
												: undefined
										}
									/>
								</span>
								<span className="min-w-0 break-all">{URL_}</span>
							</p>
							<div className="mt-3 flex flex-wrap gap-1.5">
								<Chip tone="band">Full check</Chip>
							</div>
						</div>
						{has("screenshot") ? (
							<div style={{ animation: "spike-fade 600ms ease-out" }}>
								<ScreenshotThumb
									sources={{
										small: `/api/shared/${TOKEN}/screenshot`,
										large: `/api/shared/${TOKEN}/screenshot?size=large`,
									}}
									host="atarcms.com"
									grade={done ? grade : "A+"}
								/>
							</div>
						) : (
							<BrandMark
								state="running"
								className="size-20 justify-self-end text-accent-fg/85 sm:size-24"
							/>
						)}
					</div>
				</section>
			</PlumBand>
			<div className="mx-auto w-full max-w-page px-4">
				<div className="mt-4 flex min-h-[34px] flex-wrap items-center gap-2 text-sm">
					<button
						type="button"
						onClick={() => setRun((r) => r + 1)}
						className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-fg"
					>
						Ещё раз
					</button>
					<span className="ml-3 text-muted">Лоадер плитки:</span>
					{(["spin", "pulse"] as const).map((v) => (
						<button
							key={v}
							type="button"
							onClick={() => {
								setLoader(v);
								setRun((r) => r + 1);
							}}
							className={`rounded-lg border px-3 py-1.5 ${loader === v ? "border-accent font-semibold text-accent" : "border-line"}`}
						>
							{v === "spin"
								? "A: своё колечко крутится"
								: "B: пульсирует (как сейчас)"}
						</button>
					))}
					<span className="ml-auto tabular-nums text-muted">
						{(t / 1000).toFixed(1)} s
					</span>
				</div>
				<ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
					{CATEGORIES.map(({ id, title }) => (
						<Tile
							key={`${run}-${id}`}
							id={id}
							title={title}
							loader={loader}
							score={has(id) ? SCORES[id] : null}
						/>
					))}
				</ul>
				{has("bot-access") ? (
					<section
						key={`fix-${run}`}
						className="mt-6 rounded-[14px] border border-line bg-surface p-5 shadow-card"
						style={{ animation: "spike-fade 480ms ease-out 120ms both" }}
					>
						<div className="flex flex-wrap items-start gap-x-4 gap-y-3">
							<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
								<Wand aria-hidden="true" className="size-5" />
							</span>
							<div className="min-w-0 flex-1 basis-60">
								<h2 className="text-lg font-bold">Fix files</h2>
								<p className="mt-1 text-sm text-muted">
									{has("content-semantics")
										? "robots.txt and head.html built from your site's own pages."
										: "robots.txt built from your site's own pages."}
									{done ? null : " Available when the check finishes."}
								</p>
							</div>
							<Button
								variant="primary"
								size="sm"
								disabled={!done}
								icon={<Wand aria-hidden="true" className="size-4" />}
							>
								Generate fix files
							</Button>
						</div>
					</section>
				) : null}
				{has("ai-manifests") ? (
					<div className="mt-6 space-y-3 pb-10">
						{CATEGORIES.filter(({ id }) => has(id)).map(({ id, title }) => {
							const score = SCORES[id] ?? 0;
							const status =
								score >= 90 ? "pass" : score >= 50 ? "warn" : "fail";
							return (
								<div
									key={`${run}-${id}`}
									style={{
										animation: "spike-fade 480ms ease-out 120ms both",
									}}
								>
									<CategorySection
										category={{
											id: id as never,
											title,
											status,
											score,
											skipReason: null,
											checks: 4,
											warn: status === "warn" ? 1 : 0,
											fail: status === "fail" ? 1 : 0,
										}}
										heading="h2"
										defaultOpen={false}
									>
										<p className="px-5 py-4 text-sm text-muted">
											(checks of this category)
										</p>
									</CategorySection>
								</div>
							);
						})}
					</div>
				) : null}
			</div>
		</div>
	);
}
