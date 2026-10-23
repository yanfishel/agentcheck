import type { CheerioAPI } from "cheerio";

/** A `<link>` tag or an HTTP `Link` header entry (RFC 8288), href resolved. */
export interface PageLink {
	href: URL;
	/** Lowercased rel tokens. */
	rels: string[];
	/** Lowercased media type without parameters, "" when absent. */
	type: string;
	from: "tag" | "header";
}

function mediaType(value: string | undefined): string {
	return (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function resolve(href: string, base: URL): URL | null {
	try {
		const url = new URL(href.trim(), base);
		url.hash = "";
		return url;
	} catch {
		return null;
	}
}

/** Entries of a `Link` header: `<url>; rel="a b"; type="text/markdown", <url2>; rel=x`. */
export function parseLinkHeader(value: string | null, base: URL): PageLink[] {
	if (!value) return [];
	const links: PageLink[] = [];
	const entry = /<([^>]*)>((?:\s*;\s*[^;,=]+(?:=(?:"[^"]*"|[^;,]*))?)*)/g;
	for (const match of value.matchAll(entry)) {
		const href = resolve(match[1] ?? "", base);
		if (!href) continue;
		const params: Record<string, string> = {};
		const param = /;\s*([^;,=\s]+)\s*(?:=\s*(?:"([^"]*)"|([^;,]*)))?/g;
		for (const p of (match[2] ?? "").matchAll(param)) {
			const key = (p[1] ?? "").toLowerCase();
			if (!(key in params)) params[key] = (p[2] ?? p[3] ?? "").trim();
		}
		links.push({
			href,
			rels: (params.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean),
			type: mediaType(params.type),
			from: "header",
		});
	}
	return links;
}

/** The page's `<link href>` tags, then its `Link` header entries. */
export function pageLinks(
	$: CheerioAPI,
	headers: Headers | undefined,
	base: URL,
): PageLink[] {
	const links: PageLink[] = [];
	$("link[href]").each((_, el) => {
		const href = resolve($(el).attr("href") ?? "", base);
		if (!href) return;
		links.push({
			href,
			rels: ($(el).attr("rel") ?? "")
				.toLowerCase()
				.split(/\s+/)
				.filter(Boolean),
			type: mediaType($(el).attr("type")),
			from: "tag",
		});
	});
	links.push(...parseLinkHeader(headers?.get("link") ?? null, base));
	return links;
}

/** `rel="alternate" type="text/markdown"`: the page's markdown version. */
export function isMarkdownAlternate(link: PageLink): boolean {
	return link.rels.includes("alternate") && link.type === "text/markdown";
}

/** `rel="describedby"` pointing at the origin's /llms.txt. */
export function isLlmsTxtLink(link: PageLink, origin: string): boolean {
	return (
		link.rels.includes("describedby") &&
		link.href.origin === origin &&
		link.href.pathname === "/llms.txt"
	);
}
