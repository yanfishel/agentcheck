import type { Metadata } from "next";

/**
 * The site's own identity for search and AI crawlers: metadata, robots.txt,
 * the sitemap, llms.txt and JSON-LD. A constant, not PUBLIC_BASE_URL, because
 * the landing and these files are built before the server's environment
 * exists; public links to audits still come from publicOrigin.
 */
export const SITE = {
	url: "https://agentcheck.dev",
	name: "AgentCheck",
	description: "Check how ready your website is for AI agents.",
} as const;

/** The root layout's metadata; every page inherits it. */
export const siteMetadata: Metadata = {
	metadataBase: new URL(SITE.url),
	title: SITE.name,
	description: SITE.description,
	openGraph: {
		title: SITE.name,
		description: SITE.description,
		siteName: SITE.name,
		url: "/",
		type: "website",
	},
	twitter: { card: "summary_large_image" },
};
