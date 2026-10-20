import type { ReactNode } from "react";
import { LEGAL } from "../content/legal";

/** Long-form text styles for the legal pages (there is no typography plugin). */
const prose =
	"text-foreground/90 leading-relaxed [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-foreground [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5";

/** A legal document: title, last-updated date and the text. */
export function LegalPage({
	title,
	intro,
	children,
}: {
	title: string;
	intro: ReactNode;
	children: ReactNode;
}) {
	return (
		<main className="mx-auto w-full max-w-page flex-1 px-4 pt-12 pb-16">
			<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
			<p className="mt-2 text-sm text-muted">Last updated {LEGAL.updated}</p>
			<div className={`mt-8 ${prose}`}>
				<p>{intro}</p>
				{children}
			</div>
		</main>
	);
}
