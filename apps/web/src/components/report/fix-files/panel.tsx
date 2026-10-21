"use client";

import { Download, Pencil, Wand } from "lucide-react";
import { Fragment, useMemo } from "react";
import type {
	FixFilePreview,
	FixFilesPreview,
} from "../../../server/fix-files";
import {
	Button,
	buttonClass,
	type CodeTab,
	CodeWindow,
	CopyButton,
	code,
} from "../../ui";
import { ARRIVE_RISE, useArrival } from "../arrival";
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

function fileTabs(auditId: string, files: FixFilePreview[]): CodeTab[] {
	return files.map((file) => {
		const Icon = kindIcon[file.kind];
		const href = `/api/audits/${auditId}/fix-files/${file.name}`;
		return {
			label: file.name,
			icon: <Icon aria-hidden="true" className="size-3.5" />,
			content: <Code file={file} />,
			copy: file.content,
			// A cut file is copied whole: fetched on click from its download.
			load: file.previewOf === null ? undefined : () => fetchText(href),
			copyLabel: `Copy ${file.name}`,
			actions: (
				<a
					href={href}
					download
					aria-label={`Download ${file.name}`}
					className={buttonClass("code", "sm")}
				>
					<Download aria-hidden="true" className="size-4" />
					Download
				</a>
			),
		};
	});
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

/** The Fix files card between the category tiles and the sections; null when nothing is fixable. */
export function FixFilesPanel() {
	const { view, auditId, siteUrl, activeKind, setActiveKind } = useFixFiles();
	// While the audit runs the block rises in once a category calls for a file.
	const arrived = useArrival(view.kinds.length > 0);
	if (view.kinds.length === 0) return null;
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
		<section
			id={FIX_FILES_ANCHOR}
			aria-labelledby={title}
			className={`scroll-mt-4 rounded-[14px] border border-line bg-surface p-5 shadow-card ${arrived ? ARRIVE_RISE : ""}`}
		>
			<div className="flex flex-wrap items-start gap-x-4 gap-y-3">
				<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
					<Wand aria-hidden="true" className="size-5" />
				</span>
				<div className="min-w-0 flex-1 basis-60">
					<h2 id={title} className="text-lg font-bold">
						Fix files
					</h2>
					{result ? (
						<p className="mt-1 text-sm text-muted" suppressHydrationWarning>
							{builtLine(result, siteUrl)}
						</p>
					) : (
						<StatusLine />
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{result ? (
						// Nothing to copy or download when every file was skipped.
						files.length > 0 ? (
							<>
								{view.hasPrompt ? (
									<CopyButton
										load={() =>
											fetchText(`/api/audits/${auditId}/fix-files/prompt`)
										}
										label="Copy prompt for your agent"
									/>
								) : null}
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
						<>
							<p className="mb-2 text-sm">{current.target}</p>
							<CodeWindow
								label="Fix files"
								tabs={fileTabs(auditId, files)}
								value={index}
								onValueChange={(next) => {
									const file = files[next];
									if (file) setActiveKind(file.kind);
								}}
								codeClassName="max-h-[28rem] overflow-y-auto"
							/>
							{current.previewOf !== null ? (
								<p className="mt-2 text-sm text-muted">
									{`Showing the first ${formatSize(FIX_PREVIEW_MAX)} of ${current.name} (${formatSize(current.previewOf)}). Download for the full file.`}
								</p>
							) : null}
						</>
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
	);
}
