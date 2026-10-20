import { BrandMark } from "./brand-mark";
import { PlumBand } from "./plum-band";
import { relativeTime } from "./report/relative-time";
import { FailedRing, hostOf } from "./report/score-band";
import { RerunButton } from "./rerun-button";
import { SiteIcon } from "./site-icon";
import { ButtonLink, Card, Chip, chipClass, Tooltip } from "./ui";

const absoluteTime = (date: Date) =>
	`${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * A failed audit in the report's frame: the plum band with an empty ring and
 * the failed mark where the score and grade go, the actions row, and the error
 * in a card where the report's tiles start.
 */
export function AuditFailed({
	error,
	url,
	mode,
	at,
	favicon,
	canRerun,
	now = Date.now(),
}: {
	error: string;
	url: string;
	mode: "quick" | "full";
	/** When it failed (or was created, if it never finished). */
	at: Date;
	favicon?: string;
	canRerun: boolean;
	now?: number;
}) {
	return (
		<article className="w-full">
			<PlumBand>
				<section className="relative text-accent-fg">
					<div className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-4 sm:grid-cols-[auto_1fr_auto]">
						<FailedRing />
						<div className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
							<h1 className="text-3xl font-bold tracking-tight text-balance break-all sm:text-5xl">
								{hostOf(url)}
							</h1>
							<p className="mt-1 flex items-start gap-1.5 font-mono text-sm text-accent-fg/85">
								<SiteIcon src={favicon} tone="band" />
								<span className="min-w-0 break-all">{url}</span>
							</p>
							<div className="mt-3 flex flex-wrap gap-1.5">
								<Chip tone="band">
									{mode === "full" ? "Full check" : "Quick check"}
								</Chip>
								<Tooltip content={absoluteTime(at)}>
									<button
										type="button"
										className={`${chipClass("band")} cursor-default`}
									>
										<time dateTime={at.toISOString()}>
											{relativeTime(at, now)}
										</time>
									</button>
								</Tooltip>
							</div>
						</div>
						{/* The failed mark takes the band's red, which reads on plum. */}
						<BrandMark
							state="failed"
							label="Audit failed"
							className="size-20 justify-self-end [--fail:var(--band-fail)] sm:size-24"
						/>
					</div>
				</section>
			</PlumBand>
			<div className="mx-auto w-full max-w-page px-4">
				<div className="mt-4 flex flex-wrap items-start gap-2">
					{canRerun ? <RerunButton url={url} mode={mode} /> : null}
					<ButtonLink href="/" variant="secondary" size="sm">
						Try another URL
					</ButtonLink>
				</div>
				<Card className="mt-6 p-5 sm:p-6">
					<h2 className="text-lg font-bold tracking-tight">
						The audit could not finish
					</h2>
					<p className="mt-2 break-words text-fail">{error}</p>
				</Card>
			</div>
		</article>
	);
}
