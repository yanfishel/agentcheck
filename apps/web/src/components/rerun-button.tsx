"use client";

import { useAuth } from "@clerk/nextjs";
import { RotateCw, ScanSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FullCheckDialog } from "./full-check-dialog";
import { forgetRerun, rememberRerun, takeRerun } from "./rerun-intent";
import { Button } from "./ui";

const NETWORK_ERROR = "Could not start the audit. Try again.";

export function RerunButton({
	url,
	mode,
	label,
	upgrade = false,
	auditId,
}: {
	url: string;
	mode: "quick" | "full";
	/** Accessible name when several buttons share a page, e.g. "Run again for example.com". */
	label?: string;
	/**
	 * The filled "Full check" button that re-runs a quick audit in full mode.
	 * A guest gets the sign-up dialog instead of a request (and so does a 401).
	 */
	upgrade?: boolean;
	/**
	 * The audit this button sits on. With it, a guest's press on Full check is
	 * remembered through the sign-in it needs, and the run starts by itself
	 * once they are signed in on this page; the button also carries out a
	 * remembered press of its mode made elsewhere on the page, such as a
	 * guest's Generate fix files (see rerun-intent.ts).
	 */
	auditId?: string;
}) {
	const router = useRouter();
	const { isLoaded, isSignedIn } = useAuth();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [needsAccount, setNeedsAccount] = useState(false);

	async function rerun() {
		if (pending) return;
		if (mode === "full" && isLoaded && !isSignedIn) {
			if (auditId) rememberRerun(auditId, url, "full");
			setNeedsAccount(true);
			return;
		}
		await start();
	}

	// The press a guest made before signing in: start what they asked for.
	// start() reads the latest props; the intent is consumed on the first run.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		if (!auditId || !isLoaded || !isSignedIn) return;
		if (takeRerun(auditId, mode)) void start();
	}, [auditId, mode, isLoaded, isSignedIn]);

	async function start() {
		setError(null);
		setPending(true);
		try {
			const response = await fetch("/api/audits", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url, mode }),
			});
			const body = (await response.json().catch(() => ({}))) as {
				id?: unknown;
				error?: unknown;
			};
			if (response.status === 201 && typeof body.id === "string") {
				router.push(`/audits/${body.id}`);
				return;
			}
			setPending(false);
			if (response.status === 401) {
				setNeedsAccount(true);
				return;
			}
			setError(typeof body.error === "string" ? body.error : NETWORK_ERROR);
		} catch {
			setPending(false);
			setError(NETWORK_ERROR);
		}
	}

	return (
		<div className="flex flex-col items-start gap-1">
			<Button
				variant={upgrade ? "primary" : "secondary"}
				size="sm"
				onClick={rerun}
				loading={pending}
				aria-label={pending ? undefined : label}
				icon={
					upgrade ? (
						<ScanSearch aria-hidden="true" className="size-4" />
					) : (
						<RotateCw aria-hidden="true" className="size-4" />
					)
				}
			>
				{pending ? "Starting…" : upgrade ? "Full check" : "Run again"}
			</Button>
			{error ? (
				<p role="alert" className="text-sm text-fail">
					{error}
				</p>
			) : null}
			<FullCheckDialog
				open={needsAccount}
				onOpenChange={setNeedsAccount}
				onDismiss={forgetRerun}
			/>
		</div>
	);
}
