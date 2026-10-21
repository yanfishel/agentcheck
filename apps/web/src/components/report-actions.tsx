"use client";

import { useAuth } from "@clerk/nextjs";
import { BadgeCheck, ChevronDown, Download, Share2 } from "lucide-react";
import { useState } from "react";
import { AccountDialog } from "./full-check-dialog";
import { BadgeDialog } from "./report/badge-dialog";
import { hostOf } from "./report/score-band";
import { type Share, ShareDialog } from "./report/share-dialog";
import { RerunButton } from "./rerun-button";
import { Button, Dialog, Menu } from "./ui";

/** The server-built badge URL while the token is unchanged, else one derived from the share link. */
function badgeFor(
	share: Share | null,
	shareToken: string | null,
	badgeUrl: string | null,
): string | null {
	if (!share) return null;
	if (share.token === shareToken && badgeUrl) return badgeUrl;
	return `${new URL(share.url).origin}/api/shared/${share.token}/badge.svg`;
}

/**
 * The action row under the score band, in two groups: Run again (plus Full
 * check after a quick check) on the left; Share, Get badge and Export on the right.
 */
export function ReportActions({
	auditId,
	mode,
	url,
	score,
	canRerun,
	canShare,
	shareToken,
	shareUrl,
	exportBase,
	badgeUrl,
	pending = false,
}: {
	auditId: string;
	mode: "quick" | "full";
	url: string;
	/** Required unless `pending`: the share text and the badge need it. */
	score?: number;
	canRerun: boolean;
	/** The viewer owns the audit, so it can be shared. */
	canShare: boolean;
	shareToken: string | null;
	shareUrl: string | null;
	exportBase: string;
	badgeUrl: string | null;
	/**
	 * The audit has not finished: the same buttons this viewer gets once it
	 * has, drawn faded and inert so nothing can be pressed or focused and no
	 * dialog can open.
	 */
	pending?: boolean;
}) {
	const [share, setShare] = useState<Share | null>(
		shareToken && shareUrl ? { token: shareToken, url: shareUrl } : null,
	);
	const [shareOpen, setShareOpen] = useState(false);
	const [badgeOpen, setBadgeOpen] = useState(false);
	const [prompt, setPrompt] = useState<"guest" | "not-owner" | null>(null);
	const { isLoaded, isSignedIn } = useAuth();

	/** Share for the owner; a guest is asked to sign in, anyone else to run it from their account. */
	function requestShare() {
		if (canShare) setShareOpen(true);
		else if (isLoaded && !isSignedIn) setPrompt("guest");
		else setPrompt("not-owner");
	}

	return (
		<div
			// When the audit finishes the same row turns on with a short fade.
			className={`flex flex-wrap items-start justify-between gap-2 motion-safe:transition-opacity motion-safe:duration-300${pending ? " opacity-45" : ""}`}
			inert={pending}
		>
			{/* Left: run it again (and, after a quick check, as a full one). */}
			{canRerun ? (
				<div className="flex flex-wrap items-start gap-2">
					<RerunButton url={url} mode={mode} auditId={auditId} />
					{mode === "quick" ? (
						<RerunButton url={url} mode="full" upgrade auditId={auditId} />
					) : null}
				</div>
			) : null}
			{/* Right: pass it on. */}
			<div className="flex flex-wrap items-start gap-2">
				<Button
					size="sm"
					icon={<Share2 aria-hidden="true" className="size-4" />}
					onClick={requestShare}
				>
					Share
				</Button>
				<Button
					variant="secondary"
					size="sm"
					icon={<BadgeCheck aria-hidden="true" className="size-4" />}
					onClick={() => setBadgeOpen(true)}
				>
					Get badge
				</Button>
				<Menu
					label="Export"
					trigger={
						<Button
							variant="secondary"
							size="sm"
							icon={<Download aria-hidden="true" className="size-4" />}
						>
							Export
							<ChevronDown aria-hidden="true" className="size-4" />
						</Button>
					}
					items={[
						{
							label: "JSON",
							href: `${exportBase}?format=json`,
							download: true,
						},
						{
							label: "HTML",
							href: `${exportBase}?format=html`,
							download: true,
						},
					]}
				/>
			</div>
			{canShare && !pending && score !== undefined ? (
				<ShareDialog
					open={shareOpen}
					onOpenChange={setShareOpen}
					auditId={auditId}
					share={share}
					onShareChange={setShare}
					text={`AI readiness of ${hostOf(url)}: ${score}/100 on AgentCheck`}
				/>
			) : null}
			{pending || score === undefined ? null : (
				<>
					<BadgeDialog
						open={badgeOpen}
						onOpenChange={setBadgeOpen}
						score={score}
						badgeUrl={badgeFor(share, shareToken, badgeUrl)}
						shareUrl={share?.url ?? null}
						onShare={requestShare}
					/>
					<AccountDialog
						open={prompt === "guest"}
						onOpenChange={(open) => setPrompt(open ? "guest" : null)}
						title="Sharing needs an account"
						description="Shared links belong to an account. Sign up or sign in, run the check from your account, and share that report."
					/>
					<Dialog
						open={prompt === "not-owner"}
						onOpenChange={(open) => setPrompt(open ? "not-owner" : null)}
						title="Share it from your account"
						description="Only the account that ran this check can share it. Run it again from your account and share that report."
						actions={<RerunButton url={url} mode={mode} />}
					/>
				</>
			)}
		</div>
	);
}
