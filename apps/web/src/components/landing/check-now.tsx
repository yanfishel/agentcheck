import { StartAuditForm } from "../start-audit-form";
import { HeroBackdrop } from "./hero-backdrop";

/**
 * The closing call to action: the hero's plum band once more, with the same
 * form, so a reader who got this far can start without scrolling back. The
 * backdrop has no lit cells; the hero keeps the page's one moving moment.
 */
export function CheckNow() {
	return (
		<section
			aria-labelledby="check-now-title"
			className="on-band relative isolate mt-24 overflow-hidden bg-accent px-4 pt-16 pb-10 text-center text-accent-fg sm:pt-20 sm:pb-12"
		>
			<HeroBackdrop cells={false} />
			<h2
				id="check-now-title"
				className="mx-auto max-w-[18ch] text-3xl font-bold leading-[1.1] tracking-tight text-balance sm:text-5xl"
			>
				Check your site now
			</h2>
			<p className="mx-auto mt-4 max-w-[52ch] text-lg text-accent-fg/85 text-balance">
				A quick check is free, needs no account and takes under a minute.
			</p>
			<div className="mt-8">
				<StartAuditForm id="check-now" tone="band" />
			</div>
		</section>
	);
}
