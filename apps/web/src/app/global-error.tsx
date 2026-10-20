"use client";

import { BrandMark } from "../components/brand-mark";
import { themeScript } from "../components/theme";
import { Button, buttonClass } from "../components/ui";
import "./globals.css";

/**
 * Shown when the root layout itself fails, so it renders its own document
 * (no header, footer or Clerk, which may be what broke). The error text stays
 * in the server log, never on the page.
 */
export default function GlobalError({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<title>Something went wrong — AgentCheck</title>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script with no user input.
					dangerouslySetInnerHTML={{ __html: themeScript }}
				/>
			</head>
			<body className="flex min-h-full flex-col antialiased">
				<main className="mx-auto flex w-full max-w-page flex-1 flex-col items-center px-4 py-20 text-center">
					<BrandMark state="failed" className="size-16" />
					<h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">
						Something went wrong.
					</h1>
					<p className="mt-2 text-muted">
						Try again in a moment, or start from the home page.
					</p>
					<div className="mt-6 flex flex-wrap justify-center gap-3">
						<Button variant="secondary" onClick={reset}>
							Try again
						</Button>
						{/* A full page load: the app shell that failed is not reused. */}
						<a href="/" className={buttonClass()}>
							Go to the home page
						</a>
					</div>
				</main>
			</body>
		</html>
	);
}
