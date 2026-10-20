import type { MetadataRoute } from "next";
import { SITE } from "../content/site";

/** The public pages; reports are per audit and stay out (they are noindex). */
export default function sitemap(): MetadataRoute.Sitemap {
	return ["/", "/privacy", "/terms"].map((path) => ({
		url: `${SITE.url}${path}`,
	}));
}
