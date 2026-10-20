import type { MetadataRoute } from "next";
import { SITE } from "../content/site";

/**
 * Every crawler, AI ones included, may read the public pages; the API, the
 * admin area, reports and history are private or per user.
 */
export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: ["/api/", "/admin", "/audits/", "/history"],
			},
		],
		sitemap: `${SITE.url}/sitemap.xml`,
	};
}
