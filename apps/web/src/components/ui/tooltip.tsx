"use client";

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

/** One per app (mounted in the root layout) so hovering between tooltips skips the open delay. */
export function TooltipProvider({ children }: { children: ReactNode }) {
	return <BaseTooltip.Provider>{children}</BaseTooltip.Provider>;
}

export function Tooltip({
	content,
	children,
}: {
	content: ReactNode;
	children: ReactElement;
}) {
	return (
		<BaseTooltip.Root>
			<BaseTooltip.Trigger render={children} />
			<BaseTooltip.Portal>
				<BaseTooltip.Positioner sideOffset={6}>
					<BaseTooltip.Popup
						role="tooltip"
						className="rounded-md bg-foreground px-2 py-1 text-xs text-background transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
					>
						{content}
					</BaseTooltip.Popup>
				</BaseTooltip.Positioner>
			</BaseTooltip.Portal>
		</BaseTooltip.Root>
	);
}
