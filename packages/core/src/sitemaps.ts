/** The robots.txt `Sitemap:` URLs on the site's own host (http/https only). */
export function sitemapLines(robots: string, root: URL): URL[] {
	const out: URL[] = [];
	for (const line of robots.split(/\r\n|\r|\n/)) {
		const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
		if (!match?.[1]) continue;
		try {
			const url = new URL(match[1], root);
			// Same host only: a robots.txt must not point the service at other sites.
			if (
				(url.protocol === "http:" || url.protocol === "https:") &&
				url.host === root.host
			) {
				out.push(url);
			}
		} catch {
			// not a URL: ignored
		}
	}
	return out;
}

/** True when the body has a `<urlset>` or `<sitemapindex>` root. */
export function isSitemapXml(body: string): boolean {
	return /<(urlset|sitemapindex)[\s>]/i.test(body);
}
