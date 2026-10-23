"use client";

import {
	Bot,
	ChevronDown,
	Copy,
	Download,
	MapPin,
	Pencil,
	Wand,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import type {
	FixFilePreview,
	FixFilesPreview,
} from "../../../server/fix-files";
import {
	Button,
	buttonClass,
	type CodeTab,
	CodeWindow,
	code,
	Menu,
	Tooltip,
	useToast,
	writeLoaded,
} from "../../ui";
import { ARRIVE_FADE, useArrival, useArrivalLive } from "../arrival";
import { relativeTime } from "../relative-time";
import { hostOf } from "../score-band";
import {
	FIX_ATTEMPTS_MAX,
	groupTodos,
	highlight,
	kindFileName,
	kindIcon,
	listKinds,
} from "./file-meta";
import { FIX_PREVIEW_MAX, formatSize } from "./preview";
import { FIX_FILES_ANCHOR, useFixFiles } from "./provider";

/** The text of a fix-files download, fetched for Copy; a failed response throws. */
async function fetchText(url: string): Promise<string> {
	const response = await fetch(url, { cache: "no-store" });
	if (!response.ok) throw new Error(`${url}: ${response.status}`);
	return response.text();
}

function Code({ file }: { file: FixFilePreview }) {
	// Every tab is rendered; highlight each file once, not on every render.
	const segments = useMemo(
		() => highlight(file.kind, file.content),
		[file.kind, file.content],
	);
	return (
		<>
			{segments.map((segment, index) =>
				segment.tone ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and never reordered.
					<span key={index} className={code[segment.tone]}>
						{segment.text}
					</span>
				) : (
					segment.text
				),
			)}
		</>
	);
}

/** The code language of a fix file, by its extension (the names match FILE_NAME). */
function languageOf(name: string): string {
	if (name.endsWith(".md")) return "markdown";
	if (name.endsWith(".html")) return "html";
	return "text";
}

function fileTabs(auditId: string, files: FixFilePreview[]): CodeTab[] {
	return files.map((file) => {
		const Icon = kindIcon[file.kind];
		const href = `/api/audits/${auditId}/fix-files/${file.name}`;
		return {
			label: file.name,
			icon: <Icon aria-hidden="true" className="size-3.5" />,
			language: languageOf(file.name),
			content: <Code file={file} />,
			copy: file.content,
			// A cut file is copied whole: fetched on click from its download.
			load: file.previewOf === null ? undefined : () => fetchText(href),
			copyLabel: `Copy ${file.name}`,
			status: <FileStatus file={file} />,
			actions: (
				<a
					href={href}
					download
					aria-label={`Download ${file.name}`}
					className={buttonClass("code", "sm", "max-sm:px-2")}
				>
					<Download aria-hidden="true" className="size-4" />
					<span className="max-sm:sr-only">Download</span>
				</a>
			),
		};
	});
}

/**
 * The status bar line of a file: where it goes, and for a file cut to a
 * preview a chip with the sizes (the full sentence in its tooltip).
 */
function FileStatus({ file }: { file: FixFilePreview }) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 px-4 py-2.5 text-[12.5px] leading-relaxed text-code-text/85">
			<p className="flex min-w-0 flex-1 basis-64 gap-2">
				<MapPin aria-hidden="true" className="mt-[0.3em] size-3.5 shrink-0" />
				<span className="min-w-0 break-words">{file.target}</span>
			</p>
			{file.previewOf !== null ? (
				<Tooltip
					content={`Showing the first ${formatSize(FIX_PREVIEW_MAX)} of ${file.name} (${formatSize(file.previewOf)}). Download for the full file.`}
				>
					<span className="shrink-0 cursor-default whitespace-nowrap rounded-full border border-code-dot bg-code-tab/50 px-2.5 text-code-muted">
						{`Preview: ${formatSize(FIX_PREVIEW_MAX)} of ${formatSize(file.previewOf)}`}
					</span>
				</Tooltip>
			) : null}
		</div>
	);
}

/**
 * The agent prompt (the zip's AGENT-PROMPT.md) is long, so it is not a
 * button of its own: a menu copies it (fetched on click) or downloads it.
 */
function PromptMenu({ auditId }: { auditId: string }) {
	const { toast } = useToast();
	const href = `/api/audits/${auditId}/fix-files/prompt`;
	async function copyPrompt() {
		try {
			await writeLoaded(() => fetchText(href));
			toast("Prompt copied");
		} catch {
			toast("Could not copy the prompt. Download it instead.", {
				tone: "fail",
			});
		}
	}
	return (
		<Menu
			label="Prompt for your agent"
			header={
				<p className="max-w-64 text-sm text-muted">
					One prompt that tells your coding agent where each file goes and what
					to fill in.
				</p>
			}
			trigger={
				<Button
					variant="secondary"
					size="sm"
					icon={<Bot aria-hidden="true" className="size-4" />}
				>
					Prompt for your agent
					<ChevronDown aria-hidden="true" className="size-4" />
				</Button>
			}
			items={[
				{ label: "Copy to clipboard", icon: Copy, onSelect: copyPrompt },
				{
					label: "Download AGENT-PROMPT.txt",
					icon: Download,
					href,
					download: true,
				},
			]}
		/>
	);
}

function builtLine(result: FixFilesPreview, url: string): string {
	const pages = result.pagesRead === 1 ? "1 page" : `${result.pagesRead} pages`;
	return `Built from ${pages} of ${hostOf(url)}, ${relativeTime(result.generatedAt, Date.now())}.`;
}

/** The line under the title for every state but done. */
function StatusLine() {
	const { view, busy, startError, gaveUp, role, pending } = useFixFiles();
	if (startError) return <p className="mt-1 text-sm text-fail">{startError}</p>;
	if (gaveUp) {
		return (
			<p role="status" className="mt-1 text-sm text-muted">
				This is taking longer than expected. Reload the page to check again.
			</p>
		);
	}
	// Busy covers the start request itself as well as a queued or running job.
	if (busy) {
		return (
			<p role="status" className="mt-1 text-sm text-muted">
				{view.progress && view.progress.planned > 0
					? `Reading ${view.progress.read} of ${view.progress.planned} pages…`
					: "Reading your site's pages…"}
			</p>
		);
	}
	if (view.status === "failed") {
		const last = view.attempts >= FIX_ATTEMPTS_MAX;
		return (
			<p className="mt-1 text-sm text-fail">
				{view.error ?? "Generation failed."}
				{last
					? ` Fix files can be generated ${FIX_ATTEMPTS_MAX} times for one check at most. Run a new check to try again.`
					: null}
			</p>
		);
	}
	return (
		<p className="mt-1 text-sm text-muted">
			{`${listKinds(view.kinds)} built from your site's own pages.`}
			{role === "admin" ? " Not generated yet." : null}
			{pending && role !== "admin"
				? " Available when the check finishes."
				: null}
		</p>
	);
}

function StartButton() {
	const { view, busy, canStart, start, role, pending } = useFixFiles();
	if (role === "admin") return null;
	if (pending) {
		return (
			<Button
				size="sm"
				disabled
				icon={<Wand aria-hidden="true" className="size-4" />}
			>
				Generate fix files
			</Button>
		);
	}
	if (busy) {
		return (
			<Button
				size="sm"
				disabled
				icon={<Wand aria-hidden="true" className="size-4" />}
			>
				Generating…
			</Button>
		);
	}
	if (!canStart) return null;
	return (
		<Button
			size="sm"
			onClick={start}
			icon={<Wand aria-hidden="true" className="size-4" />}
		>
			{view.status === "failed" ? "Try again" : "Generate fix files"}
		</Button>
	);
}

/** How long the block takes to collapse when a running audit turns out to have nothing to fix. */
const COLLAPSE_MS = 500;

/**
 * The Fix files card between the category tiles and the sections, with its
 * own top margin; null when nothing is fixable. While the audit runs it waits
 * (muted, a pulsing line, Generate off) until a category calls for a file;
 * once the kinds are settled with none it collapses (at once with reduced
 * motion) and stays gone for the life of the page.
 */
export function FixFilesPanel() {
	const { view, auditId, siteUrl, activeKind, setActiveKind, kindsSettled } =
		useFixFiles();
	const live = useArrivalLive();
	const waiting = view.kinds.length === 0;
	const nothingToFix = waiting && kindsSettled;
	// Nothing to fix from the first render: never shown.
	const [gone, setGone] = useState(nothingToFix);
	const [collapsing, setCollapsing] = useState(false);
	if (nothingToFix && !gone && !collapsing) {
		if (live) setCollapsing(true);
		else setGone(true);
	}
	useEffect(() => {
		if (!collapsing) return;
		const timer = setTimeout(() => setGone(true), COLLAPSE_MS);
		return () => clearTimeout(timer);
	}, [collapsing]);
	// The status line fades in over the waiting line when the first file is called for.
	const filesArrived = useArrival(!waiting);
	if (gone) return null;
	const result = view.status === "done" ? view.result : null;
	const files = result?.files ?? [];
	const index = Math.max(
		0,
		files.findIndex((file) => file.kind === activeKind),
	);
	const current = files[index];
	const todoCount = files.reduce((n, file) => n + file.todos.length, 0);
	const todoGroups = groupTodos(files);
	const title = `${FIX_FILES_ANCHOR}-title`;

	return (
		// Collapsing: height (the grid row), opacity and the margin go to zero.
		// The one column is minmax(0, 1fr): an auto column would grow to the
		// widest line of a file and push the card past the page.
		<div
			inert={collapsing}
			className={`grid grid-cols-[minmax(0,1fr)] motion-safe:transition-[grid-template-rows,opacity,margin] motion-safe:duration-500 motion-safe:ease-out ${collapsing ? "mt-0 grid-rows-[0fr] opacity-0" : "mt-6 grid-rows-[1fr]"}`}
		>
			<div className={collapsing ? "min-h-0 overflow-hidden" : "min-h-0"}>
				<section
					id={FIX_FILES_ANCHOR}
					aria-labelledby={title}
					aria-busy={waiting || undefined}
					className="scroll-mt-4 rounded-[14px] border border-line bg-surface p-5 shadow-card"
				>
					<div className="flex flex-wrap items-start gap-x-4 gap-y-3">
						<span
							className={`grid size-10 shrink-0 place-items-center rounded-xl motion-safe:transition-colors motion-safe:duration-500 ${waiting ? "bg-surface-2 text-muted" : "bg-accent-soft text-accent"}`}
						>
							<Wand aria-hidden="true" className="size-5" />
						</span>
						<div className="min-w-0 flex-1 basis-60">
							<h2
								id={title}
								className={`text-lg font-bold${waiting ? " text-muted" : ""}`}
							>
								Fix files
							</h2>
							{waiting ? (
								<span className="mt-2 block h-4 w-64 max-w-full rounded bg-surface-2 motion-safe:animate-pulse" />
							) : result ? (
								<p className="mt-1 text-sm text-muted" suppressHydrationWarning>
									{builtLine(result, siteUrl)}
								</p>
							) : (
								<div className={filesArrived ? ARRIVE_FADE : undefined}>
									<StatusLine />
								</div>
							)}
						</div>
						<div className="flex flex-wrap items-center gap-2">
							{result ? (
								// Nothing to copy or download when every file was skipped.
								files.length > 0 ? (
									<>
										{view.hasPrompt ? <PromptMenu auditId={auditId} /> : null}
										<a
											href={`/api/audits/${auditId}/fix-files/zip`}
											download
											className={buttonClass("primary", "sm")}
										>
											<Download aria-hidden="true" className="size-4" />
											Download zip
										</a>
									</>
								) : null
							) : (
								<StartButton />
							)}
						</div>
					</div>
					{result ? (
						<div className="mt-5">
							{current ? (
								<CodeWindow
									label="Fix files"
									tabs={fileTabs(auditId, files)}
									value={index}
									onValueChange={(next) => {
										const file = files[next];
										if (file) setActiveKind(file.kind);
									}}
									codeClassName="max-h-[24rem] overflow-y-auto"
								/>
							) : null}
							{result.skipped.length > 0 ? (
								<ul className="mt-3 space-y-1 text-sm text-muted">
									{result.skipped.map(({ kind, reason }) => (
										<li key={kind}>
											{`${kindFileName[kind]} was not built: ${reason}.`}
										</li>
									))}
								</ul>
							) : null}
							{todoCount > 0 ? (
								<div className="mt-3 rounded-lg bg-warn-soft px-3 py-2.5 text-sm">
									<p
										id={`${FIX_FILES_ANCHOR}-todos`}
										className="flex items-center gap-2 font-semibold"
									>
										<Pencil aria-hidden="true" className="size-4 text-warn" />
										{`Fill in by hand (${todoCount})`}
									</p>
									<dl
										aria-labelledby={`${FIX_FILES_ANCHOR}-todos`}
										className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2.5"
									>
										{todoGroups.map(({ file, items, pages }) => (
											<Fragment key={file}>
												<dt className="font-mono text-xs font-semibold leading-5">
													{file}
												</dt>
												<dd className="min-w-0">
													{items.map((item) => (
														<p key={item}>{item}</p>
													))}
													{pages.length > 0 ? (
														<>
															<p>{`Add descriptions of ${pages.length} pages:`}</p>
															<ul className="mt-1 flex flex-wrap gap-1">
																{pages.map((page) => (
																	<li
																		key={page}
																		className="rounded-md border border-line bg-surface px-1.5 font-mono text-xs leading-5 break-all"
																	>
																		{page}
																	</li>
																))}
															</ul>
														</>
													) : null}
												</dd>
											</Fragment>
										))}
									</dl>
								</div>
							) : null}
						</div>
					) : null}
				</section>
			</div>
		</div>
	);
}
