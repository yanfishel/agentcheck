"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, Settings } from "lucide-react";
import { Menu } from "./ui";

/**
 * The signed-in account menu: our Menu with Clerk's actions (profile modal and
 * sign-out) instead of Clerk's prebuilt UserButton.
 */
export function UserMenu({ className }: { className: string }) {
	const { user } = useUser();
	const { openUserProfile, signOut } = useClerk();

	if (!user) {
		// Clerk is still loading the user; keep the avatar's place.
		return (
			<span
				aria-hidden="true"
				className="size-8 rounded-full bg-accent-fg/15"
			/>
		);
	}

	const email = user.primaryEmailAddress?.emailAddress;
	// Accounts made with email only have no name; greet them instead.
	const name = user.fullName || user.username || "Hi there!";
	return (
		<Menu
			label="Account"
			header={
				// A fixed width keeps a long email from stretching the menu; it truncates instead.
				<div className="flex w-56 items-center gap-3">
					{/* biome-ignore lint/performance/noImgElement: Clerk serves the avatar from its own host. */}
					<img
						src={user.imageUrl}
						alt=""
						className="size-9 shrink-0 rounded-full"
					/>
					<div className="min-w-0">
						<p className="truncate text-sm font-semibold">{name}</p>
						{email ? (
							<p title={email} className="truncate text-xs text-muted">
								{email}
							</p>
						) : null}
					</div>
				</div>
			}
			items={[
				{
					label: "Manage account",
					icon: Settings,
					onSelect: () => openUserProfile(),
				},
				{
					label: "Sign out",
					icon: LogOut,
					onSelect: () => signOut({ redirectUrl: "/" }),
				},
			]}
			trigger={
				<button type="button" aria-label="Account" className={className}>
					{/* biome-ignore lint/performance/noImgElement: Clerk serves the avatar from its own host. */}
					<img src={user.imageUrl} alt="" className="size-8 rounded-full" />
				</button>
			}
		/>
	);
}
