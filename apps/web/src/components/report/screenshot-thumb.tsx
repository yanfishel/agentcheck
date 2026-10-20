"use client";

import type { AuditResult } from "@agentcheck/core";
import { useState } from "react";
import { Button, Dialog } from "../ui";
import { GradeMark } from "./grade-mark";

type Grade = AuditResult["grade"];

/** Where the audit's screenshot is served: the band thumbnail and the dialog image. */
export interface ScreenshotSources {
	small: string;
	large: string;
}

/**
 * The band's thumbnail of the checked page with the grade as a plum seal over
 * its bottom-left corner; a click opens the large screenshot in a dialog.
 */
export function ScreenshotThumb({
	sources,
	host,
	grade,
}: {
	sources: ScreenshotSources;
	host: string;
	grade: Grade;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			{/* The seal is a sibling of the button, not inside it: the button's name
			    would hide the grade from screen readers. */}
			<div className="relative mb-3.5 ml-4 shrink-0 justify-self-end transition-transform duration-150 motion-safe:hover:-translate-y-0.5 sm:mb-[18px] sm:ml-6 md:mb-0">
				<button
					type="button"
					aria-label={`Open screenshot of ${host}`}
					onClick={() => setOpen(true)}
					className="block rounded-[10px] outline-accent-fg outline-offset-4 focus-visible:outline-2"
				>
					{/* biome-ignore lint/performance/noImgElement: a same-origin image route behind the audit's access rules; next/image would proxy it */}
					<img
						src={sources.small}
						alt=""
						width={416}
						height={260}
						className="block h-[100px] w-[160px] rounded-[10px] object-cover object-top shadow-thumb ring-1 ring-thumb-ring sm:h-[130px] sm:w-[208px]"
					/>
				</button>
				{/* The stamp like the history cards': the frame centred on the tile,
				    the spark reaching past its corner. */}
				<span className="pointer-events-none absolute -bottom-3 -left-3 size-10 rounded-[10px] bg-accent text-accent-fg shadow-thumb sm:-bottom-3.5 sm:-left-4 sm:size-[52px] sm:rounded-[13px]">
					<span className="absolute inset-[12%]">
						<GradeMark
							grade={grade}
							stamp
							className="block size-full text-accent-fg"
						/>
					</span>
				</span>
			</div>
			<Dialog
				open={open}
				onOpenChange={setOpen}
				title={host}
				size="wide"
				actions={
					<Button size="sm" onClick={() => setOpen(false)}>
						Close
					</Button>
				}
			>
				{/* biome-ignore lint/performance/noImgElement: a same-origin image route behind the audit's access rules; next/image would proxy it */}
				<img
					src={sources.large}
					alt={`Screenshot of ${host}`}
					width={1280}
					height={800}
					className="block h-auto w-full rounded-lg ring-1 ring-line"
				/>
			</Dialog>
		</>
	);
}
