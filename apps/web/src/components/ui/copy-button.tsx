"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, type ButtonVariant } from "./button";

/**
 * Puts `text` on the clipboard, or what `load` resolves to (e.g. a file
 * fetched on click). A failed copy never shows "Copied".
 */
export function CopyButton({
	text = "",
	load,
	label = "Copy",
	copiedLabel = "Copied",
	ariaLabel,
	onCopied,
	variant = "secondary",
}: {
	text?: string;
	/** Fetches the text on click; used instead of `text`. */
	load?: () => Promise<string>;
	label?: string;
	/** A distinct accessible name (it should contain the visible label); dropped while "Copied" shows. */
	ariaLabel?: string;
	copiedLabel?: string;
	onCopied?: () => void;
	variant?: ButtonVariant;
}) {
	const [copied, setCopied] = useState(false);
	const fallback = useRef<HTMLInputElement>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => () => clearTimeout(timer.current), []);

	async function copy() {
		if (!navigator.clipboard) {
			fallback.current?.select();
			return;
		}
		if (load) {
			try {
				await writeLoaded(load);
			} catch {
				// A failed fetch: there is no text to select either.
				return;
			}
		} else {
			try {
				await navigator.clipboard.writeText(text);
			} catch {
				fallback.current?.select();
				return;
			}
		}
		setCopied(true);
		onCopied?.();
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setCopied(false), 2000);
	}

	return (
		<>
			{load ? null : (
				<input
					ref={fallback}
					readOnly
					tabIndex={-1}
					aria-hidden="true"
					value={text}
					className="sr-only"
				/>
			)}
			<Button
				variant={variant}
				size="sm"
				onClick={copy}
				aria-label={copied ? undefined : ariaLabel}
				icon={
					copied ? (
						<Check aria-hidden="true" className="size-4" />
					) : (
						<Copy aria-hidden="true" className="size-4" />
					)
				}
			>
				{copied ? copiedLabel : label}
			</Button>
		</>
	);
}

/**
 * A ClipboardItem with a promised blob keeps the click's user activation while
 * the text loads (Safari drops it across an await); without ClipboardItem the
 * text is loaded first and written as plain text.
 */
async function writeLoaded(load: () => Promise<string>): Promise<void> {
	if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
		const blob = load().then(
			(loaded) => new Blob([loaded], { type: "text/plain" }),
		);
		await navigator.clipboard.write([
			new ClipboardItem({ "text/plain": blob }),
		]);
		return;
	}
	const loaded = await load();
	await navigator.clipboard.writeText(loaded);
}
