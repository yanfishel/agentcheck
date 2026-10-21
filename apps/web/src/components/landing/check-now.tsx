import { StartAuditForm } from "../start-audit-form";
import { HeroBackdrop } from "./hero-backdrop";

const QUICK_LINE =
	"A quick check is free, needs no account and takes under a minute.";

/**
 * The closing call to action: the hero's plum band once more, with the same
 * form, so a reader who got this far can start without scrolling back. The
 * backdrop has no lit cells; the hero keeps the page's one moving moment.
 * The landing ends with it, and so do the report pages, with their own
 * heading and form id.
 */
export function CheckNow({
	id = "check-now",
	title = "Check your site now",
	line = QUICK_LINE,
}: {
	/** The form's id; the heading takes `<id>-title`. */
	id?: string;
	title?: string;
	line?: string;
}) {
	return (
		<section
			aria-labelledby={`${id}-title`}
			className="on-band relative isolate mt-24 overflow-hidden bg-accent px-4 pt-16 pb-10 text-center text-accent-fg sm:pt-20 sm:pb-12"
		>
			<HeroBackdrop cells={false} />
			<h2
				id={`${id}-title`}
				className="mx-auto max-w-[18ch] text-3xl font-bold leading-[1.1] tracking-tight text-balance sm:text-5xl"
			>
				{title}
			</h2>
			<p className="mx-auto mt-4 max-w-[52ch] text-lg text-accent-fg/85 text-balance">
				{line}
			</p>
			<div className="mt-8">
				<StartAuditForm id={id} tone="band" />
			</div>
		</section>
	);
}
