import Link from "next/link";
import type { ReactNode } from "react";
import { SiteIcon } from "./site-icon";

/**
 * A history card's picture of the site: the page's screenshot, or without one
 * a tile of the same size with the site's icon (a globe when there is none),
 * so every card's text starts in the same column. On a phone a screenshot
 * spans the card above the text and a card without one shows no tile.
 *
 * The seal (`children`) lies over the bottom-left corner as a sibling of the
 * link, not inside it: the link is hidden from assistive tech (the host link
 * is the accessible one), the score must not be.
 */
export function HistoryThumb({
	screenshotId,
	faviconSrc,
	href,
	children,
}: {
	screenshotId: string | null;
	faviconSrc?: string;
	href: string;
	children: ReactNode;
}) {
	return (
		<div
			className={`relative mb-2.5 ml-2.5 shrink-0 ${screenshotId ? "" : "hidden sm:block"}`}
		>
			<Link
				href={href}
				tabIndex={-1}
				aria-hidden="true"
				className="block rounded-[10px]"
			>
				{screenshotId ? (
					// biome-ignore lint/performance/noImgElement: a same-origin image route behind the audit's access rules; next/image would proxy it
					<img
						src={`/api/audits/${screenshotId}/screenshot`}
						alt=""
						width={128}
						height={80}
						loading="lazy"
						className="block aspect-[16/10] h-auto w-full rounded-[10px] border border-line object-cover object-top sm:h-20 sm:w-32"
					/>
				) : (
					<span className="grid h-20 w-32 place-items-center rounded-[10px] border border-line bg-surface-2">
						<SiteIcon src={faviconSrc} tone="card" size="lg" />
					</span>
				)}
			</Link>
			<div className="pointer-events-none absolute -bottom-2.5 -left-2.5">
				{children}
			</div>
		</div>
	);
}
