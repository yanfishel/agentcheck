"use client";

import { Tabs } from "@base-ui/react/tabs";
import { type ReactNode, useState } from "react";
import { CopyButton } from "./copy-button";

export type CodeTab = {
	/** Shown as the file or shell name in the window bar. */
	label: string;
	/**
	 * A file-type icon before the label, like an editor tab. An element, not a
	 * component: server components cannot pass functions to this client component.
	 */
	icon?: ReactNode;
	content: ReactNode;
	/** What Copy puts on the clipboard for this tab. */
	copy: string;
	/** Fetches what Copy puts on the clipboard on click, instead of `copy` (e.g. a file shown cut). */
	load?: () => Promise<string>;
	/** A distinct accessible name for its Copy button, e.g. "Copy workflow". */
	copyLabel: string;
	/** Extra controls for this tab in the window bar, after Copy (e.g. a Download link). */
	actions?: ReactNode;
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
	return (
		<Tabs.Root
			value={active}
			onValueChange={(next) => {
				setOwn(Number(next));
				onValueChange?.(Number(next));
			}}
			className="overflow-hidden rounded-[14px] border border-code-line bg-code-bg shadow-card"
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
				<Tabs.List
					aria-label={label}
					className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]"
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
						/>
						{current.actions}
					</div>
				) : null}
			</div>
			{tabs.map((tab, index) => (
				<Tabs.Panel key={tab.label} value={index} keepMounted>
					<pre
						className={`overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-code-text ${codeClassName ?? ""}`}
					>
						<code>{tab.content}</code>
					</pre>
				</Tabs.Panel>
			))}
			{footer}
		</Tabs.Root>
	);
}
