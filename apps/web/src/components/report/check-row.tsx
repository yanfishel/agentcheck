import { Check, Minus, TriangleAlert, X } from "lucide-react";
import { LinkedText } from "./linked-text";
import type { CheckResult, CheckStatus } from "./markers";

const icons = { pass: Check, warn: TriangleAlert, fail: X, skip: Minus };

const iconTone: Record<CheckStatus, string> = {
	pass: "text-pass",
	warn: "text-warn",
	fail: "text-fail",
	skip: "text-skip",
};

/**
 * Details with repeats folded into one line and a count: a page can have two
 * elements with the same description (two identical sliders), and the text is
 * also the list key.
 */
export function foldDetails(
	details: string[],
): { text: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const detail of details)
		counts.set(detail, (counts.get(detail) ?? 0) + 1);
	return [...counts].map(([text, count]) => ({ text, count }));
}

/**
 * One check: marker, message, details and remediation plaque. In a skipped
 * category every check repeats the category's reason (`sectionReason`, shown
 * once in its header), so such a row names the check instead.
 */
export function CheckRow({
	check,
	sectionReason,
}: {
	check: CheckResult;
	sectionReason?: string | null;
}) {
	const Icon = icons[check.status];
	const problem = check.status === "warn" || check.status === "fail";
	const details = check.status === "skip" ? [] : (check.details ?? []);
	return (
		<li className="grid grid-cols-[18px_1fr] gap-x-3 py-3">
			<Icon
				aria-hidden="true"
				className={`mt-[3px] size-[18px] ${iconTone[check.status]}`}
			/>
			<div className="min-w-0">
				<p className={check.status === "skip" ? "text-muted" : undefined}>
					<span className="sr-only">{`${check.status}: `}</span>
					<LinkedText
						text={
							check.status === "skip" && check.message === sectionReason
								? check.title
								: check.message
						}
					/>
				</p>
				{details.length > 0 ? (
					<ul className="mt-1 space-y-0.5 text-sm break-words text-muted">
						{foldDetails(details).map(({ text, count }) => (
							<li key={text}>
								<LinkedText text={text} />
								{count > 1 ? (
									<span className="ml-1.5 font-medium">×{count}</span>
								) : null}
							</li>
						))}
					</ul>
				) : null}
				{problem && check.remediation ? (
					<p className="mt-2 bg-accent-soft rounded-lg px-3 py-2 text-sm">
						<LinkedText text={check.remediation} />
					</p>
				) : null}
			</div>
		</li>
	);
}
