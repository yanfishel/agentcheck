import type { CheerioAPI } from "cheerio";
import { load } from "cheerio";
import type { Dispatcher } from "undici";
import { createFetcher, type Fetcher, type NetworkOptions } from "../http.ts";
import { menuLinks, pageMeta, sitemapUrls } from "./extract.ts";
import { buildHeadHtml } from "./head.ts";
import { FIX_KIND_ORDER } from "./kinds.ts";
import { buildLlmsTxt, llmsPages } from "./llms.ts";
import { buildLlmsFullTxt, type PageText } from "./llms-full.ts";
import { pageMarkdown } from "./markdown.ts";
import { rewriteRobots } from "./robots.ts";
import { buildMarkdownTwin } from "./twin.ts";
import type { FixFile, FixFiles, FixKind } from "./types.ts";

export interface FixOptions {
	userAgent: string;
	toolVersion: string;
	/** Opt-in network guard; the service sets it through `guardedFixOptions`. */
	network?: NetworkOptions;
	/** @internal tests only (MockAgent), like runAudit. */
	dispatcher?: Dispatcher;
	/** Stops reading early; whatever was read is still used. */
	signal?: AbortSignal;
	/** Total time for all requests (default 45 s); pages not read by then are left out. */
	budgetMs?: number;
	onProgress?: (read: number, planned: number) => void;
}

export const FIX_BUDGET_MS = 45_000;
const PAGE_MAX_BYTES = 1_048_576;
const SITEMAP_MAX_BYTES = 5_242_880;
const MAX_PAGES = 30;
const WORKERS = 4;
/** Sitemap documents read at most (listed ones plus the children of an index). */
const MAX_SITEMAP_READS = 10;
/** The tags the opengraph check requires. */
const OG_CORE = ["og:title", "og:description", "og:image", "og:url"];

/** The option pieces a service must use: network guard on. Spread into the generateFixFiles options. */
export function guardedFixOptions(input: {
	userAgent: string;
	toolVersion: string;
}): Pick<FixOptions, "userAgent" | "toolVersion" | "network"> {
	return {
		userAgent: input.userAgent,
		toolVersion: input.toolVersion,
		network: { blockPrivate: true },
	};
}

/**
 * Reads the site (only what the requested files need) and builds the fix
 * files. Throws when the audited page itself cannot be read; any other
 * missing input skips that file or leaves it with TODOs.
 */
export async function generateFixFiles(
	input: { url: string; kinds: FixKind[] },
	opts: FixOptions,
): Promise<FixFiles> {
	const fetcher = createFetcher({
		userAgent: opts.userAgent,
		dispatcher: opts.dispatcher,
		network: opts.network,
		maxBytes: PAGE_MAX_BYTES,
	});
	const controller = new AbortController();
	const stop = () => controller.abort();
	const timer = setTimeout(stop, opts.budgetMs ?? FIX_BUDGET_MS);
	if (opts.signal?.aborted) stop();
	opts.signal?.addEventListener("abort", stop, { once: true });
	try {
		return await generate(input, opts, fetcher, controller.signal);
	} finally {
		clearTimeout(timer);
		opts.signal?.removeEventListener("abort", stop);
		await fetcher.close();
	}
}

type PageRead =
	| { ok: true; url: URL; $: CheerioAPI; page: PageText }
	| { ok: false; reason: string };

type RobotsRead =
	| { kind: "found"; body: string }
	| { kind: "missing" }
	| { kind: "error"; reason: string };

function isHtml(contentType: string | null): boolean {
	const type = contentType?.split(";")[0]?.trim().toLowerCase();
	return type === "text/html" || type === "application/xhtml+xml";
}

function sitemapLines(robots: string, root: URL): URL[] {
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

async function generate(
	input: { url: string; kinds: FixKind[] },
	opts: FixOptions,
	fetcher: Fetcher,
	signal: AbortSignal,
): Promise<FixFiles> {
	const kinds = new Set(input.kinds);
	let pagesRead = 0;
	let pagesFailed = 0;
	let planned = 1;
	const progress = () => opts.onProgress?.(pagesRead, planned);

	/** Pages for llms-full.txt also keep their markdown, built once from the same document. */
	const fullText = kinds.has("llms-full");
	const readPage = async (
		url: URL,
		read: { host?: string; text: boolean },
	): Promise<PageRead> => {
		const res = await fetcher.get(url, { signal });
		if (res.kind === "error") return { ok: false, reason: res.error };
		if (res.status < 200 || res.status >= 300) {
			return { ok: false, reason: `HTTP ${res.status}` };
		}
		if (!isHtml(res.contentType)) {
			return { ok: false, reason: "not an HTML page" };
		}
		const finalUrl = new URL(res.url);
		if (read.host !== undefined && finalUrl.host !== read.host) {
			return {
				ok: false,
				reason: `redirected to another host (${finalUrl.host})`,
			};
		}
		const $ = load(res.body);
		const meta = pageMeta($, finalUrl);
		const markdown = read.text ? pageMarkdown($, finalUrl) : "";
		return { ok: true, url: finalUrl, $, page: { meta, markdown } };
	};

	const requested = new URL(input.url);
	const audited = await readPage(requested, {
		text: fullText || kinds.has("markdown"),
	});
	if (!audited.ok) {
		throw new Error(`Could not read ${input.url}: ${audited.reason}`);
	}
	pagesRead = 1;
	progress();
	const root = new URL("/", audited.url);
	/** Pages already read, by requested and final URL. */
	const known = new Map<string, PageText>([
		[requested.href, audited.page],
		[audited.url.href, audited.page],
	]);

	let robots: RobotsRead | undefined;
	// llms.txt and llms-full.txt need robots.txt for its Sitemap lines.
	if (kinds.has("robots") || kinds.has("llms") || kinds.has("llms-full")) {
		const res = await fetcher.get(new URL("/robots.txt", root), { signal });
		if (res.kind === "error") robots = { kind: "error", reason: res.error };
		else if (res.status === 200 && res.truncated) {
			// A cut file must never be offered back as a replacement.
			robots = { kind: "error", reason: "larger than 1 MB" };
		} else if (res.status === 200) robots = { kind: "found", body: res.body };
		else if (res.status >= 500) {
			robots = { kind: "error", reason: `HTTP ${res.status}` };
		} else robots = { kind: "missing" };
	}

	let sitemapPromise: Promise<{ found: URL | null; pages: URL[] }> | undefined;
	const sitemap = () => {
		sitemapPromise ??= readSitemaps(
			fetcher,
			robots?.kind === "found" ? sitemapLines(robots.body, root) : [],
			root,
			signal,
		);
		return sitemapPromise;
	};

	const built = new Map<FixKind, FixFile>();
	const skipped: FixFiles["skipped"] = [];

	if (kinds.has("robots") && robots) {
		if (robots.kind === "error") {
			skipped.push({
				kind: "robots",
				reason: `robots.txt could not be read (${robots.reason})`,
				error: true,
			});
		} else {
			const original = robots.kind === "found" ? robots.body : null;
			const found =
				original === null ? (await sitemap()).found?.href : undefined;
			const rewrite = rewriteRobots(original, audited.url, {
				toolVersion: opts.toolVersion,
				...(found ? { sitemap: found } : {}),
			});
			if (original !== null && rewrite.changed.length === 0) {
				skipped.push({
					kind: "robots",
					reason: `robots.txt already allows the AI crawlers on ${audited.url.pathname} and declares content signals`,
				});
			} else {
				built.set("robots", {
					kind: "robots",
					name: "robots.txt",
					target:
						original === null
							? "New file at /robots.txt"
							: "Replace /robots.txt at the site root",
					fixes: [
						...(original === null || rewrite.blockedBots.length > 0
							? ["ai-bots-allowed"]
							: []),
						...(rewrite.addedSignal ? ["content-signals"] : []),
					],
					content: rewrite.content,
					todos: [],
				});
			}
		}
	}

	const siteKinds = (["llms", "llms-full"] as const).filter((kind) =>
		kinds.has(kind),
	);
	if (siteKinds.length > 0) {
		let home: PageRead | undefined;
		if (audited.url.href === root.href) home = audited;
		else {
			planned++;
			home = await readPage(root, { text: fullText });
			if (home.ok) {
				pagesRead++;
				known.set(root.href, home.page);
				known.set(home.url.href, home.page);
			} else if (!signal.aborted) pagesFailed++;
			progress();
		}
		if (!home.ok) {
			for (const kind of siteKinds) {
				skipped.push({
					kind,
					reason: `the homepage could not be read (${home.reason})`,
					error: true,
				});
			}
		} else {
			/** Pages that end up on another host are left out of llms.txt. */
			const homeHost = home.url.host;
			const candidates: { url: URL; menu: boolean }[] = [];
			const seen = new Set<string>([root.href, home.url.href]);
			const add = (urls: URL[], menu: boolean) => {
				for (const url of urls) {
					if (candidates.length >= MAX_PAGES) return;
					if (seen.has(url.href)) continue;
					seen.add(url.href);
					candidates.push({ url, menu });
				}
			};
			// The homepage's final URL: a root that redirects (www, /en/) keeps its links.
			add(menuLinks(home.$, home.url), true);
			if (candidates.length < MAX_PAGES) add((await sitemap()).pages, false);

			const texts: (PageText | null)[] = candidates.map(
				(c) => known.get(c.url.href) ?? null,
			);
			const queue = candidates
				.map((c, index) => ({ url: c.url, index }))
				.filter((job) => texts[job.index] === null);
			planned += queue.length;
			progress();
			let next = 0;
			const worker = async () => {
				while (!signal.aborted) {
					const job = queue[next++];
					if (!job) return;
					const page = await readPage(job.url, {
						host: homeHost,
						text: fullText,
					});
					if (page.ok) {
						texts[job.index] = page.page;
						pagesRead++;
					} else if (!signal.aborted) pagesFailed++;
					progress();
				}
			};
			await Promise.all(Array.from({ length: WORKERS }, worker));

			const pick = (menu: boolean) =>
				candidates.flatMap((c, i) => {
					const text = texts[i];
					return c.menu === menu && text ? [text] : [];
				});
			const menu = pick(true);
			const pages = pick(false);
			const metas = (list: PageText[]) => list.map((text) => text.meta);
			if (kinds.has("llms")) {
				built.set(
					"llms",
					buildLlmsTxt(home.page.meta, metas(menu), metas(pages)),
				);
			}
			if (fullText) {
				// Same pages and order as llms.txt, mapped back to their markdown.
				const byMeta = new Map(
					[...menu, ...pages].map((text) => [text.meta, text]),
				);
				const ordered = llmsPages(
					home.page.meta,
					metas(menu),
					metas(pages),
				).flatMap((meta) => {
					const text = byMeta.get(meta);
					return text ? [text] : [];
				});
				built.set("llms-full", buildLlmsFullTxt(home.page, ordered));
			}
		}
	}

	if (kinds.has("markdown")) {
		built.set("markdown", buildMarkdownTwin(audited.page));
	}

	if (kinds.has("head")) {
		const page = audited.page.meta;
		const og = OG_CORE.some((key) => !(key in page.og));
		const jsonLd = !page.jsonLd.usable;
		if (og || jsonLd) built.set("head", buildHeadHtml(page, { og, jsonLd }));
		else {
			skipped.push({
				kind: "head",
				reason: "the page already has its OpenGraph tags and usable JSON-LD",
			});
		}
	}

	return {
		files: FIX_KIND_ORDER.flatMap((kind) => {
			const file = built.get(kind);
			return file ? [file] : [];
		}),
		skipped,
		pagesRead,
		pagesFailed,
		generatedAt: new Date().toISOString(),
		toolVersion: opts.toolVersion,
	};
}

/**
 * Reads the sitemaps listed in robots.txt (else /sitemap.xml), following an
 * index one level. `found` is the first listed sitemap that answered with one.
 */
async function readSitemaps(
	fetcher: Fetcher,
	listed: URL[],
	root: URL,
	signal: AbortSignal,
): Promise<{ found: URL | null; pages: URL[] }> {
	const top = listed.length > 0 ? listed : [new URL("/sitemap.xml", root)];
	const pages: URL[] = [];
	let found: URL | null = null;
	let reads = 0;
	const read = async (url: URL) => {
		reads++;
		const res = await fetcher.get(url, {
			signal,
			maxBytes: SITEMAP_MAX_BYTES,
		});
		if (res.kind !== "response" || res.status !== 200) return null;
		if (!/<(urlset|sitemapindex)[\s>]/i.test(res.body)) return null;
		return sitemapUrls(res.body, root);
	};
	for (const url of top) {
		if (reads >= MAX_SITEMAP_READS || signal.aborted) break;
		if (pages.length >= MAX_PAGES * 2) break;
		const doc = await read(url);
		if (!doc) continue;
		found ??= url;
		pages.push(...doc.pages);
		for (const child of doc.sitemaps) {
			if (reads >= MAX_SITEMAP_READS || signal.aborted) break;
			if (pages.length >= MAX_PAGES * 2) break;
			const sub = await read(child);
			if (sub) pages.push(...sub.pages);
		}
	}
	return { found, pages };
}
