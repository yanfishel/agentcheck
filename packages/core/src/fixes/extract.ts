import type { CheerioAPI } from "cheerio";
import { load } from "cheerio";
import { hasSchemaOrgContext } from "../checks/structured-data.ts";
import { cleanText } from "./text.ts";

export interface PageMeta {
	url: string;
	title: string;
	description: string;
	siteName: string;
	/** False when siteName is only the host (the page names no site). */
	siteNameFromPage: boolean;
	ogTitle: string;
	ogDescription: string;
	image: string;
	canonical: string;
	/** Existing og:* properties. */
	og: Record<string, string>;
	jsonLd: { present: boolean; usable: boolean; names: string[] };
	logo: string;
	h1: string;
}

const TRACKING = /^(utm_|gclid$|fbclid$|ref$)/i;
const SEPARATORS = [" | ", " – ", " - ", " — "];

/** Resolves a link; keeps http(s) only, drops the fragment and tracking query. */
export function normaliseLink(href: string, base: URL): URL | null {
	let url: URL;
	try {
		url = new URL(href.trim(), base);
	} catch {
		return null;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return null;
	url.hash = "";
	for (const key of [...url.searchParams.keys()]) {
		if (TRACKING.test(key)) url.searchParams.delete(key);
	}
	return url;
}

function absolute(value: string | undefined, base: URL): string {
	const text = cleanText(value, 2000);
	if (!text) return "";
	return normaliseLink(text, base)?.href ?? "";
}

function jsonLdInfo($: CheerioAPI) {
	let present = false;
	let usable = false;
	const names: string[] = [];
	const collect = (node: unknown) => {
		if (Array.isArray(node)) return node.forEach(collect);
		if (!node || typeof node !== "object") return;
		const obj = node as Record<string, unknown>;
		const types = ([] as unknown[]).concat(obj["@type"]);
		if (
			typeof obj.name === "string" &&
			types.some((t) => t === "WebSite" || t === "Organization")
		) {
			names.push(cleanText(obj.name));
		}
		collect(obj["@graph"]);
	};
	$("script[type]").each((_, el) => {
		const type = $(el).attr("type")?.trim().toLowerCase();
		if (type !== "application/ld+json") return;
		present = true;
		try {
			const parsed: unknown = JSON.parse($(el).text());
			if (hasSchemaOrgContext(parsed)) usable = true;
			collect(parsed);
		} catch {
			// unparsable block: present but not usable
		}
	});
	return { present, usable, names: names.filter(Boolean) };
}

/** The title cut at the first separator; empty without a separator. */
function nameFromTitle(title: string): string {
	let cut = -1;
	for (const sep of SEPARATORS) {
		const at = title.indexOf(sep);
		if (at > 0 && (cut === -1 || at < cut)) cut = at;
	}
	return cut > 0 ? cleanText(title.slice(0, cut)) : "";
}

const LOGO = /logo/i;

/** A header image whose alt or file name contains "logo". */
function findLogo($: CheerioAPI, base: URL): string {
	const img = $("header img")
		.filter((_, el) => {
			const src = $(el).attr("src")?.trim();
			if (!src) return false;
			const file = src.split(/[?#]/)[0]?.split("/").pop() ?? "";
			return LOGO.test($(el).attr("alt") ?? "") || LOGO.test(file);
		})
		.first();
	return absolute(img.attr("src"), base);
}

export function pageMeta($: CheerioAPI, url: URL): PageMeta {
	const og: Record<string, string> = {};
	$("meta[property^='og:']").each((_, el) => {
		const key = $(el).attr("property")?.trim().toLowerCase();
		const content = cleanText($(el).attr("content"), 300);
		if (key && content && !(key in og)) og[key] = content;
	});
	const title = cleanText($("title").first().text());
	const jsonLd = jsonLdInfo($);
	const pageName =
		og["og:site_name"] || jsonLd.names[0] || nameFromTitle(title);
	return {
		url: url.href,
		title,
		description: cleanText($("meta[name='description']").attr("content"), 300),
		siteName: pageName || url.hostname,
		siteNameFromPage: Boolean(pageName),
		ogTitle: og["og:title"] ?? "",
		ogDescription: og["og:description"] ?? "",
		image: absolute(og["og:image"], url),
		canonical: absolute($("link[rel='canonical']").attr("href"), url),
		og,
		jsonLd,
		logo: findLogo($, url),
		h1: cleanText($("h1").first().text()),
	};
}

/** Same-host http(s) links of the header/nav/[role=navigation] menus (whole page if none), deduplicated. */
export function menuLinks($: CheerioAPI, base: URL): URL[] {
	let anchors = $("header a[href], nav a[href], [role='navigation'] a[href]");
	if (anchors.length === 0) anchors = $("a[href]");
	const seen = new Set<string>();
	const out: URL[] = [];
	anchors.each((_, el) => {
		const href = $(el).attr("href") ?? "";
		if (href.trim().startsWith("#")) return;
		const link = normaliseLink(href, base);
		if (!link || link.host !== base.host || seen.has(link.href)) return;
		seen.add(link.href);
		out.push(link);
	});
	return out;
}

/** Reads a sitemap or sitemap index; only same-host entries are returned. */
export function sitemapUrls(
	xml: string,
	base: URL,
): { pages: URL[]; sitemaps: URL[] } {
	const $ = load(xml, { xml: true });
	const collect = (selector: string) => {
		const seen = new Set<string>();
		const out: URL[] = [];
		$(selector).each((_, el) => {
			const link = normaliseLink($(el).text(), base);
			if (!link || link.host !== base.host || seen.has(link.href)) return;
			seen.add(link.href);
			out.push(link);
		});
		return out;
	};
	return {
		pages: collect("urlset > url > loc"),
		sitemaps: collect("sitemapindex > sitemap > loc"),
	};
}
