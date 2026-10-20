"use client";

import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function Collapsible({
	open,
	defaultOpen,
	onOpenChange,
	trigger,
	children,
	id,
	heading,
	hiddenUntilFound = false,
}: {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	trigger: ReactNode;
	children: ReactNode;
	id?: string;
	/** Wraps the trigger button in a heading (the WAI accordion pattern). */
	heading?: "h2" | "h3" | "h4";
	/** Keeps the closed panel in the DOM as `hidden="until-found"`, so find-in-page opens it. */
	hiddenUntilFound?: boolean;
}) {
	const button = (
		<BaseCollapsible.Trigger className="group flex w-full items-center justify-between gap-2 rounded-lg py-2 text-left focus-visible:outline-2 outline-accent outline-offset-2">
			<span className="min-w-0 flex-1">{trigger}</span>
			<ChevronDown
				aria-hidden="true"
				className="size-4 shrink-0 transition-transform duration-150 group-data-[panel-open]:rotate-180"
			/>
		</BaseCollapsible.Trigger>
	);
	const Heading = heading;
	return (
		<BaseCollapsible.Root
			id={id}
			open={open}
			defaultOpen={defaultOpen}
			onOpenChange={(next) => onOpenChange?.(next)}
		>
			{Heading ? <Heading>{button}</Heading> : button}
			<BaseCollapsible.Panel
				hiddenUntilFound={hiddenUntilFound}
				className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 data-[ending-style]:h-0 data-[starting-style]:h-0"
			>
				{children}
			</BaseCollapsible.Panel>
		</BaseCollapsible.Root>
	);
}
