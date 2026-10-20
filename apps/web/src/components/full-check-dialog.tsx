"use client";

import { useClerk } from "@clerk/nextjs";
import { Button, Dialog } from "./ui";

/**
 * Asks a guest to sign up or sign in for something that needs an account.
 * Sign up and Sign in open Clerk's modal and come back to the page the guest
 * is on, so they can try again.
 */
export function AccountDialog({
	open,
	onOpenChange,
	title,
	description,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
}) {
	const { openSignIn, openSignUp } = useClerk();

	function here() {
		return `${window.location.pathname}${window.location.search}`;
	}

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			description={description}
			actions={
				<>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => {
							onOpenChange(false);
							openSignIn({
								forceRedirectUrl: here(),
								signUpForceRedirectUrl: here(),
							});
						}}
					>
						Sign in
					</Button>
					<Button
						size="sm"
						onClick={() => {
							onOpenChange(false);
							openSignUp({
								forceRedirectUrl: here(),
								signInForceRedirectUrl: here(),
							});
						}}
					>
						Sign up
					</Button>
				</>
			}
		/>
	);
}

/** A guest pressed Full check: it needs an account. */
export function FullCheckDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<AccountDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Full check needs an account"
			description="A full check also opens the page in a real browser and tests what agents can click and read there. Accounts are free."
		/>
	);
}
