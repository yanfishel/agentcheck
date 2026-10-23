import type { ReactNode } from "react";
import { LEGAL } from "../content/legal";
import { SITE } from "../content/site";
import { jsonLd } from "./landing/structured-data";

/** Long-form text styles for the legal pages (there is no typography plugin). */
const prose =
	"text-foreground/90 leading-relaxed [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-foreground [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5";

/** "20 October 2026" as an ISO date for schema.org. */
function isoDate(text: string): string {
	return new Date(`${text} 00:00 UTC`).toISOString().slice(0, 10);
}

/** A legal document: title, last-updated date, the text and its schema.org WebPage. */
export function LegalPage({
	title,
	path,
	description,
	intro,
	children,
}: {
	title: string;
	/** The page's path ("/privacy"), for its URL in JSON-LD. */
	path: string;
	description: string;
	intro: ReactNode;
	children: ReactNode;
}) {
	const page = {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: title,
		url: `${SITE.url}${path}`,
		description,
		dateModified: isoDate(LEGAL.updated),
		isPartOf: {
			"@type": "WebSite",
			"@id": `${SITE.url}/#website`,
			url: `${SITE.url}/`,
		},
	};
	return (
		<main className="mx-auto w-full max-w-page flex-1 px-4 pt-12 pb-16">
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant JSON-LD, `<` escaped.
				dangerouslySetInnerHTML={{ __html: jsonLd(page) }}
			/>
			<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
			<p className="mt-2 text-sm text-muted">Last updated {LEGAL.updated}</p>
			<div className={`mt-8 ${prose}`}>
				<p>{intro}</p>
				{children}
			</div>
		</main>
	);
}
