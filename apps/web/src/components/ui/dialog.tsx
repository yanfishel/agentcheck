"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

const SIZES = {
	default: "max-w-[440px]",
	medium: "max-w-[560px]",
	wide: "max-w-[min(1000px,calc(100%-2rem))]",
} as const;

export function Dialog({
	open,
	onOpenChange,
	title,
	description,
	children,
	actions,
	size = "default",
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	children?: ReactNode;
	actions?: ReactNode;
	/** wide: for a large image, up to 1000px. */
	size?: "default" | "medium" | "wide";
}) {
	return (
		<BaseDialog.Root open={open} onOpenChange={onOpenChange}>
			<BaseDialog.Portal>
				<BaseDialog.Backdrop className="absolute inset-0 bg-scrim transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
				<BaseDialog.Popup
					className={`fixed top-1/2 left-1/2 w-[calc(100%-2rem)] ${SIZES[size]} -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[14px] border border-line bg-surface p-6 shadow-card outline-none transition duration-150 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0`}
				>
					<BaseDialog.Close
						aria-label="Close dialog"
						className="absolute top-[22px] right-5 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 outline-accent outline-offset-2"
					>
						<X aria-hidden="true" className="size-4" />
					</BaseDialog.Close>
					{/* Room on the right for the close button. */}
					<BaseDialog.Title className="mb-[15px] pr-10 text-lg font-semibold">
						{title}
					</BaseDialog.Title>
					{description ? (
						<BaseDialog.Description
							className={`text-sm text-muted ${children ? "mb-5" : ""}`}
						>
							{description}
						</BaseDialog.Description>
					) : null}
					{children ? <div>{children}</div> : null}
					{actions ? (
						<div className="mt-6 flex justify-end gap-2">{actions}</div>
					) : null}
				</BaseDialog.Popup>
			</BaseDialog.Portal>
		</BaseDialog.Root>
	);
}
