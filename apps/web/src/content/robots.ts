import { SITE } from "./site";

/**
 * agentcheck.dev's robots.txt. Every crawler, AI ones included, may read the
 * public pages; the API, the admin area, reports and history are private or
 * per user. The Content-Signal line (contentsignals.org) lets search, AI
 * answers and training use the public pages: the site wants to be known.
 */
export function robotsTxt(): string {
	return [
		"User-agent: *",
		"Content-Signal: search=yes, ai-input=yes, ai-train=yes",
		"Allow: /",
		"Disallow: /api/",
		"Disallow: /admin",
		"Disallow: /audits/",
		"Disallow: /history",
		"",
		`Sitemap: ${SITE.url}/sitemap.xml`,
		"",
	].join("\n");
}
