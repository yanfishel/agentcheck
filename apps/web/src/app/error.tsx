"use client";

import { BrandMark } from "../components/brand-mark";
import { Button, ButtonLink } from "../components/ui";

export default function ErrorPage({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<main className="mx-auto flex w-full max-w-page flex-1 flex-col items-center px-4 py-20 text-center">
			<BrandMark state="failed" className="size-16" />
			<h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">
				This page could not be loaded.
			</h1>
			<div className="mt-6 flex flex-wrap justify-center gap-3">
				<Button variant="secondary" onClick={reset}>
					Try again
				</Button>
				<ButtonLink href="/">Go to the home page</ButtonLink>
			</div>
		</main>
	);
}
