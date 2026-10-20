"use client";

import { Ban, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Dialog, Tooltip, useToast } from "./ui";

const NETWORK_ERROR = "Could not update the user. Try again.";

export function BlockToggle({
	id,
	email,
	blocked,
	isAdmin,
}: {
	id: string;
	email: string;
	blocked: boolean;
	isAdmin: boolean;
}) {
	const router = useRouter();
	const { toast } = useToast();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const verb = blocked ? "Unblock" : "Block";

	async function confirm() {
		if (pending) return;
		setError(null);
		setPending(true);
		try {
			const response = await fetch(
				`/api/admin/users/${encodeURIComponent(id)}`,
				{
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ blocked: !blocked }),
				},
			);
			if (response.status === 200) {
				setPending(false);
				setOpen(false);
				toast(blocked ? "Unblocked" : "Blocked");
				router.refresh();
				return;
			}
			const body = (await response.json().catch(() => ({}))) as {
				error?: unknown;
			};
			setError(typeof body.error === "string" ? body.error : NETWORK_ERROR);
		} catch {
			setError(NETWORK_ERROR);
		}
		setPending(false);
	}

	const icon = blocked ? (
		<CircleCheck aria-hidden="true" className="size-4" />
	) : (
		<Ban aria-hidden="true" className="size-4" />
	);

	if (isAdmin) {
		// aria-disabled keeps the button focusable so the tooltip can explain why.
		return (
			<Tooltip content="Admins cannot be blocked">
				<Button
					variant="secondary"
					size="sm"
					icon={icon}
					aria-disabled="true"
					aria-label={`${verb} ${email}`}
					className="cursor-not-allowed opacity-60"
				>
					{verb}
				</Button>
			</Tooltip>
		);
	}

	return (
		<>
			<Button
				variant={blocked ? "secondary" : "danger"}
				size="sm"
				icon={icon}
				aria-label={`${verb} ${email}`}
				onClick={() => {
					setError(null);
					setOpen(true);
				}}
			>
				{verb}
			</Button>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!pending) setOpen(next);
				}}
				title={`${verb} ${email}?`}
				description={
					blocked
						? "They will be able to start audits again."
						: "They will not be able to start audits."
				}
				actions={
					<>
						<Button
							variant="secondary"
							onClick={() => setOpen(false)}
							disabled={pending}
						>
							Cancel
						</Button>
						<Button
							variant={blocked ? "primary" : "danger"}
							onClick={confirm}
							loading={pending}
							className={blocked ? "" : "border border-fail"}
						>
							{blocked ? "Unblock user" : "Block user"}
						</Button>
					</>
				}
			>
				{error ? (
					<p role="alert" className="text-sm text-fail">
						{error}
					</p>
				) : null}
			</Dialog>
		</>
	);
}
