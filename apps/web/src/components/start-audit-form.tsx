"use client";

import { useAuth } from "@clerk/nextjs";
import { CircleAlert, LoaderCircle, ScanSearch, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import {
	type FormEvent,
	type KeyboardEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { FullCheckDialog } from "./full-check-dialog";
import { RobotIcon } from "./robot-icon";
import { Button, Field, Input } from "./ui";

type Mode = "quick" | "full";

const NETWORK_ERROR = "Could not start the audit. Try again.";
const EMPTY_ERROR = "Enter a website address.";
/** Square icon-only buttons on phones (the label stays for screen readers), icon and label from sm up. */
const buttonClass =
	"h-10 w-10 shrink-0 py-0 duration-300 sm:h-11 sm:w-auto sm:px-4 sm:text-sm";

/**
 * The URL field with the Quick and Full check buttons. The hero's form
 * (`id="start"`) floats on the hero's lower edge and takes the focus; the
 * closing band's (`tone="band"`) sits inside the plum band and never does.
 */
export function StartAuditForm({
	id = "start",
	tone = "page",
}: {
	id?: string;
	/** "band": inside the plum band, with the hint in the band's colours. */
	tone?: "page" | "band";
} = {}) {
	const primaryForm = id === "start";
	const router = useRouter();
	// Guests default to quick (full needs an account), signed-in users to full.
	// Until Clerk has loaded neither button is primary, so nothing flips on
	// refresh; the colour then eases in. Enter falls back to quick meanwhile.
	const { isLoaded, isSignedIn } = useAuth();
	const primary: Mode | null = isLoaded
		? isSignedIn
			? "full"
			: "quick"
		: null;
	const quickRef = useRef<HTMLButtonElement>(null);
	const fullRef = useRef<HTMLButtonElement>(null);
	const [url, setUrl] = useState("");
	const [pending, setPending] = useState<Mode | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [needsAccount, setNeedsAccount] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// The cursor waits in the field: on load where there is a mouse (on a
	// phone a focused field would open the keyboard over the hero), and after
	// any link to #start (the page scrolls there smoothly; focus does not
	// scroll again).
	useEffect(() => {
		if (!primaryForm) return;
		const focus = () => inputRef.current?.focus({ preventScroll: true });
		if (window.matchMedia?.("(pointer: fine)").matches) focus();
		function onClick(event: MouseEvent) {
			const link = (event.target as Element | null)?.closest("a[href]");
			if (link?.getAttribute("href")?.endsWith("#start")) focus();
		}
		document.addEventListener("click", onClick);
		return () => document.removeEventListener("click", onClick);
	}, [primaryForm]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (pending) return;
		const submitter = (event.nativeEvent as SubmitEvent).submitter;
		const mode: Mode =
			submitter instanceof HTMLButtonElement && submitter.value === "full"
				? "full"
				: "quick";
		// The form is noValidate: our message replaces the browser's bubble.
		if (!url.trim()) {
			setError(EMPTY_ERROR);
			return;
		}
		setError(null);
		// A guest's Full check gets the sign-up dialog, like every Full check button.
		if (mode === "full" && isLoaded && !isSignedIn) {
			setNeedsAccount(true);
			return;
		}
		setPending(mode);
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
			setPending(null);
			if (response.status === 401) {
				setNeedsAccount(true);
				return;
			}
			setError(typeof body.error === "string" ? body.error : NETWORK_ERROR);
		} catch {
			setPending(null);
			setError(NETWORK_ERROR);
		}
	}

	/** Enter submits the primary mode; the browser default would always pick the first button. */
	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
		event.preventDefault();
		event.currentTarget.form?.requestSubmit(
			((primary ?? "quick") === "full" ? fullRef : quickRef).current,
		);
	}

	return (
		<div
			className={
				primaryForm
					? "relative mx-4 -mt-11 max-w-3xl sm:mx-auto"
					: "relative mx-auto max-w-3xl"
			}
		>
			<form
				id={id}
				onSubmit={handleSubmit}
				aria-label="Start an audit"
				noValidate
				className="scroll-mt-6"
			>
				<Field
					label={<span className="sr-only">Website URL</span>}
					error={
						error ? (
							<>
								<CircleAlert aria-hidden="true" className="size-4 shrink-0" />
								{error}
							</>
						) : null
					}
					hint="Quick runs without a browser. Full check adds browser-based checks and needs an account."
					hintClassName={`mt-1.5 grid min-h-8 place-items-center text-center text-sm ${tone === "band" ? "text-accent-fg/80" : "text-muted"}`}
					errorClassName="mt-1.5 inline-flex max-w-full items-center gap-2 justify-self-center rounded-2xl bg-fail-soft px-3.5 py-1.5 text-sm font-medium text-fail sm:rounded-full"
					stackMessages
				>
					{/* One pill holds the input and both mode buttons; it always has a plum edge (ring offset), adds a light halo on focus (visible on the plum hero and the page) and draws the error border. */}
					<div className="flex items-center gap-1.5 rounded-full border border-accent bg-surface p-1.5 shadow-lift ring-focus-halo ring-offset-2 ring-offset-band-bg has-[input:focus-visible]:ring-4 has-[[data-invalid]]:border-fail">
						<RobotIcon className="ml-2.5 size-[26px] shrink-0 text-accent sm:ml-3.5" />
						<Input
							ref={inputRef}
							id={primaryForm ? "url" : `${id}-url`}
							type="text"
							inputMode="url"
							autoComplete="url"
							mono
							bare
							value={url}
							onChange={(event) => {
								setUrl(event.target.value);
								setError(null);
							}}
							onKeyDown={handleKeyDown}
							placeholder="https://example.com"
							className="min-w-0 flex-1 py-2 pl-1.5 text-sm sm:pl-2 sm:text-base"
						/>
						<Button
							type="submit"
							name="mode"
							value="quick"
							ref={quickRef}
							variant={primary === "quick" ? "primary" : "soft"}
							disabled={pending !== null}
							size="sm"
							icon={
								pending === "quick" ? (
									<LoaderCircle
										aria-hidden="true"
										className="size-4 animate-spin"
									/>
								) : (
									<Zap aria-hidden="true" className="size-4" />
								)
							}
							className={buttonClass}
						>
							<span className="sr-only sm:not-sr-only">
								{pending === "quick" ? "Starting" : "Quick"}
							</span>
						</Button>
						<Button
							type="submit"
							name="mode"
							value="full"
							ref={fullRef}
							variant={primary === "full" ? "primary" : "soft"}
							disabled={pending !== null}
							size="sm"
							icon={
								pending === "full" ? (
									<LoaderCircle
										aria-hidden="true"
										className="size-4 animate-spin"
									/>
								) : (
									<ScanSearch aria-hidden="true" className="size-4" />
								)
							}
							className={buttonClass}
						>
							<span className="sr-only sm:not-sr-only">
								{pending === "full" ? "Starting" : "Full check"}
							</span>
						</Button>
					</div>
				</Field>
			</form>
			<FullCheckDialog open={needsAccount} onOpenChange={setNeedsAccount} />
		</div>
	);
}
