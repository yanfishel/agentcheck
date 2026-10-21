import { RerunButton } from "../rerun-button";

/**
 * The row under a skipped browser category on a done quick report: the
 * checks need a real browser, and the same Full check button as in the
 * actions bar starts one (a guest gets the account dialog first).
 */
export function FullCheckOffer({
	auditId,
	url,
}: {
	auditId: string;
	url: string;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			<p className="text-sm text-muted">
				A full check opens the page in a real browser and runs these checks.
			</p>
			<RerunButton url={url} mode="full" upgrade auditId={auditId} />
		</div>
	);
}
