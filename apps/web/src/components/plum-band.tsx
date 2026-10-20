import type { ReactNode } from "react";
import { HeroBackdrop } from "./landing/hero-backdrop";

/**
 * A full-width plum band that continues the header, on the hero's backdrop
 * (glow, grid and grain, no lit cells); the content inside keeps the page width.
 */
export function PlumBand({ children }: { children: ReactNode }) {
	return (
		<div className="on-band relative isolate overflow-hidden bg-accent text-accent-fg">
			<HeroBackdrop cells={false} />
			<div className="mx-auto w-full max-w-page px-4 pt-16 pb-6 sm:pt-28 sm:pb-8">
				{children}
			</div>
		</div>
	);
}
