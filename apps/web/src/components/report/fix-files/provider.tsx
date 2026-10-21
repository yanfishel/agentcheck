"use client";

import type { FixKind } from "@agentcheck/core/fixes";
import type { AuditMode } from "@agentcheck/db";
import { useAuth } from "@clerk/nextjs";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { FixFilesView } from "../../../server/fix-files";
import { AccountDialog } from "../../full-check-dialog";
import { RerunButton } from "../../rerun-button";
import { forgetRerun, rememberRerun } from "../../rerun-intent";
import { Dialog } from "../../ui";
import { FIX_ATTEMPTS_MAX } from "./file-meta";

export type FixFilesRole = "owner" | "admin" | "other";

/** The id of the Fix files block, the target of the category footers' links. */
export const FIX_FILES_ANCHOR = "fix-files";

const POLL_INTERVAL_MS = 1500;
/** Polling stops after this long; the block then asks for a manual reload. */
const MAX_POLL_MS = 5 * 60_000;
const START_FAILED = "Could not start generating the files. Try again.";

type FixFilesContext = {
	view: FixFilesView;
	role: FixFilesRole;
	auditId: string;
	url: string;
	/** The page the generator read (the audit's final URL), for the "Built from" line. */
	siteUrl: string;
	/** A request to start is on its way, or the job is queued or running and still polled. */
	busy: boolean;
	/** Why the last start request failed, if it did. */
	startError: string | null;
	/** Polling gave up while the job was still running. */
	gaveUp: boolean;
	/** The owner may (re)start: never generated, or failed with attempts left. */
	canStart: boolean;
	start(): void;
	openFile(kind: FixKind): void;
	activeKind: FixKind | null;
	setActiveKind(kind: FixKind): void;
};

const Context = createContext<FixFilesContext | null>(null);

export function useFixFiles(): FixFilesContext {
	const value = useContext(Context);
	if (!value) throw new Error("useFixFiles needs a FixFilesProvider");
	return value;
}

function isActive(status: FixFilesView["status"]): boolean {
	return status === "queued" || status === "running";
}

/**
 * The fix-files state of one report, shared by the Fix files block and the
 * category footers: one view, one start request, one poll.
 */
export function FixFilesProvider({
	auditId,
	url,
	finalUrl,
	mode,
	role,
	initial,
	children,
}: {
	auditId: string;
	/** The submitted URL, for Run again. */
	url: string;
	/** Where the audit ended up (the generator reads this site); defaults to `url`. */
	finalUrl?: string;
	mode: AuditMode;
	role: FixFilesRole;
	initial: FixFilesView;
	children: ReactNode;
}) {
	const [view, setView] = useState<FixFilesView>(initial);
	const [starting, setStarting] = useState(false);
	const [startError, setStartError] = useState<string | null>(null);
	const [gaveUp, setGaveUp] = useState(false);
	const [activeKind, setActiveKind] = useState<FixKind | null>(null);
	const [prompt, setPrompt] = useState<"guest" | "not-owner" | null>(null);
	const { isLoaded, isSignedIn } = useAuth();
	const startingRef = useRef(false);
	const endpoint = `/api/audits/${auditId}/fix-files`;

	const active = isActive(view.status);
	// Once polling gives up (timeout or 404) the block asks for a reload instead.
	const busy = starting || (active && !gaveUp);
	const canStart =
		view.status === "none" ||
		(view.status === "failed" && view.attempts < FIX_ATTEMPTS_MAX);

	const start = useCallback(() => {
		if (role !== "owner") {
			if (role === "admin") return;
			if (isLoaded && !isSignedIn) {
				// The press is remembered; once signed in on this page the check
				// runs again from their account (RerunButton carries it out).
				rememberRerun(auditId, url, mode);
				setPrompt("guest");
			} else {
				setPrompt("not-owner");
			}
			return;
		}
		if (startingRef.current || busy || !canStart) return;
		startingRef.current = true;
		setStarting(true);
		setStartError(null);
		void (async () => {
			try {
				const response = await fetch(endpoint, { method: "POST" });
				const body = (await response.json().catch(() => null)) as
					| (FixFilesView & { error?: string })
					| null;
				if (response.ok && body && "status" in body) {
					setGaveUp(false);
					setView(body);
				} else {
					setStartError(body?.error ?? START_FAILED);
				}
			} catch {
				setStartError(START_FAILED);
			} finally {
				startingRef.current = false;
				setStarting(false);
			}
		})();
	}, [
		role,
		isLoaded,
		isSignedIn,
		busy,
		canStart,
		endpoint,
		auditId,
		url,
		mode,
	]);

	const openFile = useCallback((kind: FixKind) => {
		setActiveKind(kind);
		document
			.getElementById(FIX_FILES_ANCHOR)
			?.scrollIntoView({ behavior: "smooth", block: "start" });
	}, []);

	useEffect(() => {
		if (!active) return;
		let cancelled = false;
		let polling = false;
		const startedAt = Date.now();
		const timer = setInterval(poll, POLL_INTERVAL_MS);

		function stop() {
			cancelled = true;
			clearInterval(timer);
		}

		async function poll() {
			if (Date.now() - startedAt > MAX_POLL_MS) {
				stop();
				setGaveUp(true);
				return;
			}
			if (polling) return;
			polling = true;
			try {
				const response = await fetch(endpoint, {
					cache: "no-store",
					signal: AbortSignal.timeout(10_000),
				});
				if (cancelled) return;
				if (response.status === 404) {
					stop();
					setGaveUp(true);
					return;
				}
				if (!response.ok) return;
				const body = (await response.json()) as FixFilesView;
				if (cancelled) return;
				// A new status stops this poll; a still-active one starts a new one.
				setView(body);
			} catch {
				// A transient network error or a timed-out request; the next tick retries.
			} finally {
				polling = false;
			}
		}

		return stop;
	}, [active, endpoint]);

	const value = useMemo<FixFilesContext>(
		() => ({
			view,
			role,
			auditId,
			url,
			siteUrl: finalUrl ?? url,
			busy,
			startError,
			gaveUp,
			canStart,
			start,
			openFile,
			activeKind,
			setActiveKind,
		}),
		[
			view,
			role,
			auditId,
			url,
			finalUrl,
			busy,
			startError,
			gaveUp,
			canStart,
			start,
			openFile,
			activeKind,
		],
	);

	return (
		<Context.Provider value={value}>
			{children}
			<AccountDialog
				open={prompt === "guest"}
				onOpenChange={(open) => setPrompt(open ? "guest" : null)}
				onDismiss={forgetRerun}
				title="Fix files need an account"
				description="Fix files belong to an account. Sign up or sign in: this check runs again from your account as soon as you are in, and you generate them from that report."
			/>
			<Dialog
				open={prompt === "not-owner"}
				onOpenChange={(open) => setPrompt(open ? "not-owner" : null)}
				title="Generate them from your account"
				description="Only the account that ran this check can generate its fix files. Run it again from your account and generate them from that report."
				actions={<RerunButton url={url} mode={mode} />}
			/>
		</Context.Provider>
	);
}
