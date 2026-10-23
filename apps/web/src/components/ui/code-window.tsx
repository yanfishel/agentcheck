"use client";

import { Tabs } from "@base-ui/react/tabs";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { CopyButton } from "./copy-button";
import { RadioMenu } from "./menu";

export type CodeTab = {
	/** Shown as the file or shell name in the window bar. */
	label: string;
	/**
	 * A file-type icon before the label, like an editor tab. An element, not a
	 * component: server components cannot pass functions to this client component.
	 */
	icon?: ReactNode;
	content: ReactNode;
	/**
	 * The code's language (`bash`, `yaml`, `markdown`, `html`, `text`), set as
	 * `language-*` on the `<code>`: agents (and our own code-languages check)
	 * read it to tell a command from its output.
	 */
	language: string;
	/** What Copy puts on the clipboard for this tab. */
	copy: string;
	/** Fetches what Copy puts on the clipboard on click, instead of `copy` (e.g. a file shown cut). */
	load?: () => Promise<string>;
	/** A distinct accessible name for its Copy button, e.g. "Copy workflow". */
	copyLabel: string;
	/** Extra controls for this tab in the window bar, after Copy (e.g. a Download link). */
	actions?: ReactNode;
	/** A line about this tab in the status bar under the code (e.g. where the file goes). */
	status?: ReactNode;
};

/**
 * A dark editor/terminal window: three dots, one tab per file, Copy for the active
 * tab. Tabs read like an editor's: the active one joins the code below (same fill,
 * accent line on top), the others are dimmer and light up on hover. All panels stay
 * mounted (hidden when inactive) so their text is in the HTML.
 */
export function CodeWindow({
	label,
	tabs,
	footer,
	value,
	onValueChange,
	codeClassName,
}: {
	label: string;
	tabs: CodeTab[];
	/** Content under the code, inside the window (e.g. a rendered preview). */
	footer?: ReactNode;
	/** The active tab's index when the parent controls it (e.g. a link elsewhere selects a tab). */
	value?: number;
	onValueChange?: (index: number) => void;
	/** Extra classes for the code block, e.g. a max height for long files. */
	codeClassName?: string;
}) {
	const [own, setOwn] = useState(0);
	const active = value ?? own;
	const current = tabs[active] ?? tabs[0];
	const hasStatus = tabs.some((tab) => tab.status);
	const select = (next: number) => {
		setOwn(next);
		onValueChange?.(next);
	};
	return (
		<Tabs.Root
			value={active}
			onValueChange={(next) => select(Number(next))}
			// Dark scrollbars on the dark window in both themes.
			className="overflow-hidden rounded-[14px] border border-code-line bg-code-bg shadow-card [color-scheme:dark] [scrollbar-color:var(--code-dot)_transparent]"
		>
			<div className="flex items-end gap-2 bg-code-bar px-3 pt-2">
				<span
					aria-hidden="true"
					className="mr-1.5 mb-3.5 hidden gap-1.5 self-end sm:flex"
				>
					<i className="size-2.5 rounded-full bg-code-dot" />
					<i className="size-2.5 rounded-full bg-code-dot" />
					<i className="size-2.5 rounded-full bg-code-dot" />
				</span>
				{/* On a phone the tabs do not fit beside the buttons: one picker
				    shows the active file and lists the others. */}
				{current && tabs.length > 1 ? (
					<RadioMenu
						label={label}
						align="start"
						value={String(active)}
						onValueChange={(next) => select(Number(next))}
						options={tabs.map((tab, index) => ({
							value: String(index),
							label: tab.label,
						}))}
						trigger={
							<button
								type="button"
								aria-label={`${label}: ${current.label}, ${active + 1} of ${tabs.length}`}
								className="mb-1.5 inline-flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-code-bg px-3 py-2 font-mono text-xs text-code-fg shadow-[inset_0_2px_0_var(--code-prompt)] outline-none focus-visible:outline-2 focus-visible:outline-code-prompt sm:hidden"
							>
								{current.icon}
								<span className="truncate">{current.label}</span>
								<span className="ml-auto text-code-muted">
									{active + 1}/{tabs.length}
								</span>
								<ChevronDown
									aria-hidden="true"
									className="size-4 shrink-0 text-code-muted"
								/>
							</button>
						}
					/>
				) : null}
				<Tabs.List
					aria-label={label}
					className={`min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none] ${tabs.length > 1 ? "hidden sm:flex" : "flex"}`}
				>
					{tabs.map(({ label: name, icon }, index) => (
						<Tabs.Tab
							key={name}
							value={index}
							className="inline-flex shrink-0 items-center gap-2 rounded-t-lg px-3.5 py-2.5 font-mono text-xs text-code-muted outline-none transition-colors hover:bg-code-tab/60 hover:text-code-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-code-prompt data-[active]:bg-code-bg data-[active]:text-code-fg data-[active]:shadow-[inset_0_2px_0_var(--code-prompt)]"
						>
							{icon}
							{name}
						</Tabs.Tab>
					))}
				</Tabs.List>
				{current ? (
					<div className="mb-1.5 flex shrink-0 items-center gap-1.5">
						<CopyButton
							variant="code"
							text={current.copy}
							load={current.load}
							ariaLabel={current.copyLabel}
							compact
						/>
						{current.actions}
					</div>
				) : null}
			</div>
			{/* Every panel sits in the same grid cell, so the window is as tall as
			    its tallest tab and switching tabs never changes its height. An
			    inactive panel drops the `hidden` attribute (preflight's
			    `display: none !important` would take it out of the layout) and is
			    hidden by visibility instead; Base UI keeps it `inert`. */}
			<div className="grid">
				{tabs.map((tab, index) => (
					<Tabs.Panel
						key={tab.label}
						value={index}
						keepMounted
						render={({ hidden: _hidden, ...props }) => <div {...props} />}
						className="[grid-area:1/1] min-w-0 data-hidden:invisible"
					>
						<pre
							className={`h-full overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-code-text ${codeClassName ?? ""}`}
						>
							<code className={`language-${tab.language}`}>{tab.content}</code>
						</pre>
					</Tabs.Panel>
				))}
			</div>
			{/* The status bar keeps every tab's line in one grid cell too, so it
			    is as tall as the longest line and never moves the page. */}
			{hasStatus ? (
				<div className="grid border-t border-code-line bg-code-bar">
					{tabs.map((tab, index) => (
						<div
							key={tab.label}
							inert={index !== active}
							aria-hidden={index !== active || undefined}
							className={`[grid-area:1/1] min-w-0${index !== active ? " invisible" : ""}`}
						>
							{tab.status}
						</div>
					))}
				</div>
			) : null}
			{footer}
		</Tabs.Root>
	);
}
