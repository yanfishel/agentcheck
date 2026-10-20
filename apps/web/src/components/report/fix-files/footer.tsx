"use client";

import { Button } from "../../ui";
import { categoryPitch, kindFileName, kindsForCategory } from "./file-meta";
import { FIX_FILES_ANCHOR, useFixFiles } from "./provider";

const row =
	"flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line-soft py-3 text-sm";

/**
 * The last row of a category section whose file the audit can generate: the
 * pitch and Generate, then the progress, then a link to the file in the block.
 */
export function FixFilesFooter({ categoryId }: { categoryId: string }) {
	const { view, role, busy, canStart, start, openFile } = useFixFiles();
	const kinds = kindsForCategory(categoryId).filter((kind) =>
		view.kinds.includes(kind),
	);
	if (kinds.length === 0) return null;
	const pitch = categoryPitch(kinds);

	if (view.status === "done") {
		const built =
			view.result?.files.filter((f) => kinds.includes(f.kind)) ?? [];
		const skipped =
			view.result?.skipped.filter((s) => kinds.includes(s.kind)) ?? [];
		const first = built[0];
		if (!first && skipped.length === 0) return null;
		return (
			<>
				{first ? (
					<div className={row}>
						<p>{pitch}</p>
						<a
							href={`#${FIX_FILES_ANCHOR}`}
							onClick={(event) => {
								event.preventDefault();
								openFile(first.kind);
							}}
							className="font-semibold text-accent underline-offset-4 hover:underline"
						>
							{`Open ${first.name} in Fix files`}
						</a>
					</div>
				) : null}
				{skipped.map(({ kind, reason }) => (
					<div key={kind} className={row}>
						<p className="text-muted">{`${kindFileName[kind]} was not built: ${reason}.`}</p>
					</div>
				))}
			</>
		);
	}

	if (role === "admin") return null;
	if (!busy && !canStart) return null;
	return (
		<div className={row}>
			<p>{pitch}</p>
			<Button variant="secondary" size="sm" disabled={busy} onClick={start}>
				{busy
					? "Generating…"
					: view.status === "failed"
						? "Try again"
						: "Generate fix files"}
			</Button>
		</div>
	);
}
