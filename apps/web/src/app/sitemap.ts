import type { MetadataRoute } from "next";
import { LEGAL } from "../content/legal";
import { SITE } from "../content/site";

/**
 * The public pages; reports are per audit and stay out (they are noindex).
 * The landing changes with each release, so its lastmod is the build time;
 * the legal pages carry their "Last updated" date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
	const legal = new Date(`${LEGAL.updated} 00:00 UTC`);
	return [
		{ url: `${SITE.url}/`, lastModified: new Date() },
		// Built from the engine's checks: it changes with each release.
		{ url: `${SITE.url}/checks`, lastModified: new Date() },
		{ url: `${SITE.url}/privacy`, lastModified: legal },
		{ url: `${SITE.url}/terms`, lastModified: legal },
	];
}
