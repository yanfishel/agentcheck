"use client";

import { badgeSnippetTabs } from "../badge-snippets";
import { Button, CodeWindow, Dialog } from "../ui";

/** The README badge: snippets for a shared report, otherwise how to get one. */
export function BadgeDialog({
	open,
	onOpenChange,
	score,
	badgeUrl,
	shareUrl,
	onShare,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	score: number;
	badgeUrl: string | null;
	shareUrl: string | null;
	/** Opens the share flow (the share dialog, or the sign-in prompt for guests). */
	onShare: () => void;
}) {
	const alt = `AI Ready: ${score}/100`;

	if (badgeUrl && shareUrl) {
		return (
			<Dialog
				open={open}
				onOpenChange={onOpenChange}
				size="medium"
				title="Get badge"
				description="The badge shows the score of this report and links to it."
				actions={
					<Button size="sm" onClick={() => onOpenChange(false)}>
						Done
					</Button>
				}
			>
				<CodeWindow
					label="Badge snippets"
					tabs={badgeSnippetTabs({ alt, badgeUrl, reportUrl: shareUrl })}
					footer={
						<div className="border-t border-code-line bg-surface p-4">
							<p className="text-xs text-muted">Preview</p>
							{/* biome-ignore lint/performance/noImgElement: a tiny same-origin SVG badge; next/image would rewrite its URL */}
							<img
								src={badgeUrl}
								alt={alt}
								height={20}
								className="mt-2 h-5 w-auto"
							/>
						</div>
					}
				/>
			</Dialog>
		);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title="Get badge"
			actions={
				<Button
					size="sm"
					onClick={() => {
						onOpenChange(false);
						onShare();
					}}
				>
					Share
				</Button>
			}
		>
			<p className="text-sm">Share the report to publish its badge</p>
		</Dialog>
	);
}
