"use client";

import { useClerk } from "@clerk/nextjs";
import { useRef } from "react";
import { Button, Dialog } from "./ui";

/**
 * Asks a guest to sign up or sign in for something that needs an account.
 * Sign up and Sign in open Clerk's modal and come back to the page the guest
 * is on, so they can try again.
 */
export function AccountDialog({
	open,
	onOpenChange,
	onDismiss,
	title,
	description,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The guest closed the dialog without going to sign in or sign up. */
	onDismiss?: () => void;
	title: string;
	description: string;
}) {
	const { openSignIn, openSignUp } = useClerk();
	const proceeding = useRef(false);

	function here() {
		return `${window.location.pathname}${window.location.search}`;
	}

	/** Sign in or Sign up: closes the dialog on the way, not a dismissal. */
	function proceed(open: () => void) {
		proceeding.current = true;
		onOpenChange(false);
		open();
	}

	function change(next: boolean) {
		if (!next && !proceeding.current) onDismiss?.();
		proceeding.current = false;
		onOpenChange(next);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={change}
			title={title}
			description={description}
			actions={
				<>
					<Button
						variant="secondary"
						size="sm"
						onClick={() =>
							proceed(() =>
								openSignIn({
									forceRedirectUrl: here(),
									signUpForceRedirectUrl: here(),
								}),
							)
						}
					>
						Sign in
					</Button>
					<Button
						size="sm"
						onClick={() =>
							proceed(() =>
								openSignUp({
									forceRedirectUrl: here(),
									signInForceRedirectUrl: here(),
								}),
							)
						}
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
	onDismiss,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDismiss?: () => void;
}) {
	return (
		<AccountDialog
			open={open}
			onOpenChange={onOpenChange}
			onDismiss={onDismiss}
			title="Full check needs an account"
			description="A full check also opens the page in a real browser, tests what agents can click and read there, and checks up to 10 pages of the site. Accounts are free, and the check starts as soon as you are in."
		/>
	);
}
