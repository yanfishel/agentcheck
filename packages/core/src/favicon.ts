import type { CheerioAPI } from "cheerio";
import type { Fetcher } from "./http.ts";

export type FaviconContentType =
	| "image/png"
	| "image/x-icon"
	| "image/gif"
	| "image/jpeg"
	| "image/webp"
	| "image/svg+xml";

export interface Favicon {
	contentType: FaviconContentType;
	body: Uint8Array;
}

export const FAVICON_MAX_BYTES = 102_400;

const MIN_SIZE = 32;

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
	return signature.every((byte, i) => bytes[i] === byte);
}

/** Linear scan past BOM, whitespace, XML declarations, comments and one doctype; true when `<svg` follows. */
function startsWithSvg(head: string): boolean {
	let i = head.charCodeAt(0) === 0xfeff ? 1 : 0;
	let doctypeSeen = false;
	while (i < head.length) {
		const c = head[i];
		if (c !== undefined && /\s/.test(c)) {
			i++;
			continue;
		}
		if (head.startsWith("<?", i)) {
			const end = head.indexOf("?>", i + 2);
			if (end < 0) return false;
			i = end + 2;
		} else if (head.startsWith("<!--", i)) {
			const end = head.indexOf("-->", i + 4);
			if (end < 0) return false;
			i = end + 3;
		} else if (head.slice(i, i + 9).toLowerCase() === "<!doctype") {
			if (doctypeSeen) return false;
			doctypeSeen = true;
			const end = head.indexOf(">", i + 9);
			if (end < 0) return false;
			i = end + 1;
		} else {
			return /^<svg[\s>/]/i.test(head.slice(i, i + 5));
		}
	}
	return false;
}

/** Detects the image format from its leading bytes; the declared content type is never trusted. */
export function detectImageType(bytes: Uint8Array): FaviconContentType | null {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return "image/png";
	}
	if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return "image/x-icon";
	if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (
		startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
		bytes.length >= 12 &&
		startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
	) {
		return "image/webp";
	}
	const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 2048));
	return startsWithSvg(head) ? "image/svg+xml" : null;
}

interface IconLink {
	url: string;
	/** Smallest declared dimension of at least MIN_SIZE, or null. */
	size: number | null;
	scalable: boolean;
}

function declaredSize(sizes: string | undefined): number | null {
	let best: number | null = null;
	for (const token of (sizes ?? "").toLowerCase().split(/\s+/)) {
		const match = token.match(/^(\d+)x(\d+)$/);
		const width = match ? Number(match[1]) : 0;
		if (width >= MIN_SIZE && (best === null || width < best)) best = width;
	}
	return best;
}

function linksWithRel($: CheerioAPI, token: string, base: URL): IconLink[] {
	const links: IconLink[] = [];
	$("link[rel][href]").each((_, el) => {
		const rels = ($(el).attr("rel") ?? "").toLowerCase().split(/\s+/);
		const href = ($(el).attr("href") ?? "").trim();
		if (!rels.includes(token) || href === "") return;
		let url: string;
		try {
			url = new URL(href, base).href;
		} catch {
			return;
		}
		const sizes = $(el).attr("sizes");
		const type = ($(el).attr("type") ?? "").toLowerCase();
		links.push({
			url,
			size: declaredSize(sizes),
			scalable:
				/\bany\b/i.test(sizes ?? "") ||
				type === "image/svg+xml" ||
				/\.svg(?:$|[?#])/i.test(href),
		});
	});
	return links;
}

function best(links: IconLink[]): string | null {
	const sized = links
		.filter((l) => l.size !== null)
		.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
	return (
		(sized[0] ?? links.find((l) => l.scalable) ?? links[0] ?? null)?.url ?? null
	);
}

/** Ordered, deduplicated icon URLs; always ends with `<origin>/favicon.ico`. */
export function faviconCandidates($: CheerioAPI, pageUrl: URL): string[] {
	let base = pageUrl;
	const baseHref = $("base[href]").first().attr("href");
	if (baseHref) {
		try {
			base = new URL(baseHref, pageUrl);
		} catch {
			// An unusable <base> is ignored.
		}
	}
	const list = [
		best(linksWithRel($, "icon", base)),
		best(linksWithRel($, "apple-touch-icon", base)),
		new URL("/favicon.ico", pageUrl).href,
	].filter((url): url is string => url !== null);
	return [...new Set(list)];
}

function decodePercent(payload: string): Uint8Array {
	const out: number[] = [];
	const encoder = new TextEncoder();
	for (let i = 0; i < payload.length; i++) {
		const hex = payload.slice(i + 1, i + 3);
		if (payload[i] === "%" && /^[0-9a-f]{2}$/i.test(hex)) {
			out.push(Number.parseInt(hex, 16));
			i += 2;
		} else {
			const cp = payload.codePointAt(i) ?? 0;
			if (cp > 0xffff) i++;
			out.push(...encoder.encode(String.fromCodePoint(cp)));
		}
	}
	return new Uint8Array(out);
}

function decodeDataUri(uri: string): Uint8Array | null {
	if (uri.length > FAVICON_MAX_BYTES * 3) return null;
	const comma = uri.indexOf(",");
	if (comma < 0) return null;
	const meta = uri.slice(5, comma);
	const payload = uri.slice(comma + 1);
	if (/;base64$/i.test(meta)) {
		return new Uint8Array(Buffer.from(payload, "base64"));
	}
	return decodePercent(payload);
}

function validate(bytes: Uint8Array): Favicon | null {
	if (bytes.length === 0 || bytes.length > FAVICON_MAX_BYTES) return null;
	const contentType = detectImageType(bytes);
	return contentType ? { contentType, body: bytes } : null;
}

async function load(
	fetcher: Fetcher,
	url: string,
	signal?: AbortSignal,
): Promise<Favicon | null> {
	if (url.slice(0, 5).toLowerCase() === "data:") {
		const bytes = decodeDataUri(url);
		return bytes ? validate(bytes) : null;
	}
	const res = await fetcher.getBytes(url, {
		maxBytes: FAVICON_MAX_BYTES,
		signal,
	});
	if (res.kind !== "response" || res.status !== 200 || res.truncated) {
		return null;
	}
	return validate(res.bytes);
}

/** Finds the site's icon; tries the first linked icon, then /favicon.ico. Never throws. */
export async function fetchFavicon(
	fetcher: Fetcher,
	$: CheerioAPI,
	pageUrl: URL,
	opts?: { signal?: AbortSignal },
): Promise<Favicon | null> {
	try {
		const list = faviconCandidates($, pageUrl);
		const tries = list.length > 1 ? [list[0], list[list.length - 1]] : list;
		for (const url of tries) {
			if (!url) continue;
			if (opts?.signal?.aborted) break;
			try {
				const icon = await load(fetcher, url, opts?.signal);
				if (icon) return icon;
			} catch {
				// Try the next candidate.
			}
		}
	} catch {
		// Discovery failures mean no icon.
	}
	return null;
}
