"use client";

import { Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, CopyButton, Dialog, Field, Input, useToast } from "../ui";
import { ShareIcon } from "./share-icons";
import { shareTargets } from "./share-targets";

export type Share = { token: string; url: string };

/** A share place: a round icon over its name. */
const TARGET =
	"group flex w-14 flex-col items-center gap-1.5 rounded-xl text-center text-xs leading-tight font-medium text-muted hover:text-foreground focus-visible:outline-2 outline-accent outline-offset-2";
const CIRCLE =
	"grid size-11 place-items-center rounded-full border border-line text-foreground transition-colors group-hover:border-accent group-hover:bg-accent-soft";

/**
 * The owner's share dialog. Without a public link it offers to open one; with
 * a link it shows the link with Copy, the places to post it, and Stop sharing.
 * `text` is the post's line (host and score).
 */
export function ShareDialog({
	open,
	onOpenChange,
	auditId,
	share,
	onShareChange,
	text,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	auditId: string;
	share: Share | null;
	onShareChange: (share: Share | null) => void;
	text: string;
}) {
	const { toast } = useToast();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// The system share sheet exists on phones and some desktops; known only in the browser.
	const [canNativeShare, setCanNativeShare] = useState(false);
	const endpoint = `/api/audits/${auditId}/share`;

	useEffect(() => {
		setCanNativeShare(typeof navigator.share === "function");
	}, []);

	function changeOpen(next: boolean) {
		if (!next) setError(null);
		onOpenChange(next);
	}

	async function call(method: "POST" | "DELETE", failure: string) {
		setBusy(true);
		setError(null);
		try {
			const res = await fetch(endpoint, { method });
			if (!res.ok) throw new Error(failure);
			if (method === "POST") {
				const body = (await res.json().catch(() => null)) as {
					shareToken?: unknown;
					url?: unknown;
				} | null;
				if (
					typeof body?.shareToken !== "string" ||
					typeof body.url !== "string"
				) {
					throw new Error(failure);
				}
				onShareChange({ token: body.shareToken, url: body.url });
			} else {
				onShareChange(null);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : failure);
		} finally {
			setBusy(false);
		}
	}

	const errorLine = error ? (
		<p role="alert" className="mt-3 text-sm text-fail">
			{error}
		</p>
	) : null;

	if (!share) {
		return (
			<Dialog
				open={open}
				onOpenChange={changeOpen}
				title="Make this report public?"
				description="Sharing creates a public link: anyone with it can open the report, and its AI Ready badge goes live. You can stop sharing at any time."
				actions={
					<>
						<Button variant="ghost" size="sm" onClick={() => changeOpen(false)}>
							Cancel
						</Button>
						<Button
							size="sm"
							loading={busy}
							onClick={() => call("POST", "Could not create the link")}
						>
							Create link
						</Button>
					</>
				}
			>
				{errorLine}
			</Dialog>
		);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={changeOpen}
			title="Share this report"
			description="Anyone with the link can open the report."
			actions={
				<>
					<Button
						variant="danger"
						size="sm"
						loading={busy}
						onClick={() => call("DELETE", "Could not stop sharing")}
					>
						Stop sharing
					</Button>
					<Button size="sm" onClick={() => changeOpen(false)}>
						Done
					</Button>
				</>
			}
		>
			<Field label="Share link">
				<div className="flex items-center gap-2">
					<Input
						readOnly
						mono
						value={share.url}
						onFocus={(e) => e.currentTarget.select()}
						className="min-w-0 text-sm"
					/>
					<CopyButton
						text={share.url}
						label="Copy"
						ariaLabel="Copy link"
						onCopied={() => toast("Link copied")}
					/>
				</div>
			</Field>
			{/* Round icon buttons with the name under each: logos are bare glyphs, the circle is ours. */}
			<ul
				aria-label="Share on"
				className="mt-5 grid grid-cols-4 justify-items-center gap-y-4"
			>
				{shareTargets(share.url, text).map((target) => (
					<li key={target.id}>
						<a
							href={target.href}
							target="_blank"
							rel="noopener noreferrer"
							className={TARGET}
						>
							<span className={CIRCLE}>
								<ShareIcon id={target.id} className="size-[18px]" />
							</span>
							<span>{target.label}</span>
						</a>
					</li>
				))}
				{canNativeShare ? (
					<li>
						<button
							type="button"
							onClick={() =>
								navigator
									.share({ title: text, text, url: share.url })
									.catch(() => {})
							}
							className={TARGET}
						>
							<span className={CIRCLE}>
								<Share2 aria-hidden="true" className="size-[18px]" />
							</span>
							<span>More</span>
						</button>
					</li>
				) : null}
			</ul>
			{errorLine}
		</Dialog>
	);
}
