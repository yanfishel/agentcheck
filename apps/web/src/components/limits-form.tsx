"use client";

import type { LimitSettings } from "@agentcheck/db";
import { useState } from "react";
import { Button, Card, Field, Input, useToast } from "./ui";

const NETWORK_ERROR = "Could not save the limits. Try again.";

const FIELDS: { name: keyof LimitSettings; label: string; hint: string }[] = [
	{
		name: "anonQuickPerHour",
		label: "Anonymous quick checks per hour",
		hint: "Per visitor address.",
	},
	{
		name: "userFullPerDay",
		label: "Full checks per user per day",
		hint: "Signed-in users only.",
	},
	{
		name: "userQuickPerDay",
		label: "Quick checks per user per day",
		hint: "Signed-in users only.",
	},
	{
		name: "hostPer10Min",
		label: "Checks per site per 10 minutes",
		hint: "Across all users.",
	},
	{
		name: "hostRunningMax",
		label: "Running checks per site",
		hint: "Extra checks wait in the queue.",
	},
];

/** The server names the field first ("hostRunningMax must be …"); such errors go inline. */
function fieldOf(message: string): keyof LimitSettings | null {
	const first = message.split(" ", 1)[0];
	return FIELDS.find((f) => f.name === first)?.name ?? null;
}

export function LimitsForm({ initial }: { initial: LimitSettings }) {
	const { toast } = useToast();
	const [values, setValues] = useState<Record<keyof LimitSettings, string>>({
		anonQuickPerHour: String(initial.anonQuickPerHour),
		userFullPerDay: String(initial.userFullPerDay),
		userQuickPerDay: String(initial.userQuickPerDay),
		hostPer10Min: String(initial.hostPer10Min),
		hostRunningMax: String(initial.hostRunningMax),
	});
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const errorField = error ? fieldOf(error) : null;

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (pending) return;
		setError(null);
		setPending(true);
		try {
			const payload = Object.fromEntries(
				FIELDS.map(({ name }) => [name, Number(values[name])]),
			);
			const response = await fetch("/api/admin/settings", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (response.status === 200) {
				toast("Limits saved");
			} else {
				const body = (await response.json().catch(() => ({}))) as {
					error?: unknown;
				};
				setError(typeof body.error === "string" ? body.error : NETWORK_ERROR);
			}
		} catch {
			setError(NETWORK_ERROR);
		}
		setPending(false);
	}

	return (
		<Card className="mt-6 p-5 sm:p-6">
			<form onSubmit={submit} className="flex flex-col gap-5">
				<div className="grid gap-5 sm:grid-cols-2">
					{FIELDS.map(({ name, label, hint }) => (
						<Field
							key={name}
							label={label}
							hint={hint}
							error={errorField === name ? error : undefined}
						>
							<Input
								name={name}
								type="number"
								inputMode="numeric"
								min={1}
								max={1000000}
								step={1}
								required
								mono
								value={values[name]}
								onChange={(event) =>
									setValues((current) => ({
										...current,
										[name]: event.target.value,
									}))
								}
							/>
						</Field>
					))}
				</div>
				{error && !errorField ? (
					<p role="alert" className="text-sm text-fail">
						{error}
					</p>
				) : null}
				<div className="flex justify-end border-t border-line-soft pt-5">
					<Button type="submit" loading={pending}>
						Save limits
					</Button>
				</div>
			</form>
		</Card>
	);
}
