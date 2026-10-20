import { Agent, type Dispatcher, fetch, type Response } from "undici";
import { createGuardedLookup, type Resolve } from "./net/guarded-lookup.ts";
import { BLOCKED_PREFIX, blockedMessage, checkUrl } from "./net/policy.ts";

export type HttpResult =
	| {
			kind: "response";
			url: string;
			status: number;
			contentType: string | null;
			headers: Headers;
			body: string;
			truncated: boolean;
	  }
	| { kind: "error"; url: string; error: string; blocked?: true };

export type BytesResult =
	| {
			kind: "response";
			url: string;
			status: number;
			contentType: string | null;
			bytes: Uint8Array;
			truncated: boolean;
	  }
	| { kind: "error"; url: string; error: string; blocked?: true };

type RawResult =
	| {
			kind: "response";
			url: string;
			status: number;
			contentType: string | null;
			headers: Headers;
			bytes: Uint8Array;
			truncated: boolean;
	  }
	| { kind: "error"; url: string; error: string; blocked?: true };

export interface GetOptions {
	/** Aborts the request (on top of the fetcher's own timeout). */
	signal?: AbortSignal;
	/** Byte cap for this request instead of the fetcher's `maxBytes`. */
	maxBytes?: number;
}

export interface Fetcher {
	/** Cached per URL; a call with `opts` bypasses the cache (and is not stored in it). */
	get(url: string | URL, opts?: GetOptions): Promise<HttpResult>;
	/** Raw bytes of a resource, capped at `maxBytes`; same guard, redirects and timeout as `get`, never cached. */
	getBytes(
		url: string | URL,
		opts: { maxBytes: number; signal?: AbortSignal },
	): Promise<BytesResult>;
	/** Releases the guarded agent; a no-op when a dispatcher was supplied or there is no guard. */
	close(): Promise<void>;
}

export interface NetworkOptions {
	blockPrivate: boolean;
	/** @internal for tests; the service must leave this unset — widening it voids the guard. */
	resolve?: Resolve;
	/**
	 * @internal tests only (e.g. MockAgent); disables DNS-level checks.
	 * Required to combine blockPrivate with a custom dispatcher.
	 */
	trustDispatcher?: boolean;
}

export interface FetcherOptions {
	userAgent: string;
	dispatcher?: Dispatcher;
	timeoutMs?: number;
	maxRedirects?: number;
	maxBytes?: number;
	/** Opt-in network guard: refuse private/loopback targets on every hop. */
	network?: NetworkOptions;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function charsetOf(contentType: string | null): string | null {
	const match = contentType?.match(/charset\s*=\s*"?([^\s;"]+)/i);
	return match?.[1] ?? null;
}

const META_SNIFF_BYTES = 1024;
const META_CHARSET = /<meta\s[^>]*?charset\s*=\s*["']?\s*([\w.:-]+)/i;

/** Looks for a charset declared in a <meta> tag within the first bytes of an HTML body. */
function sniffMetaCharset(
	bytes: Uint8Array,
	contentType: string | null,
): string | null {
	const type = contentType?.split(";")[0]?.trim().toLowerCase();
	if (type !== "text/html" && type !== "application/xhtml+xml") return null;
	let head = "";
	for (const byte of bytes.subarray(0, META_SNIFF_BYTES)) {
		head += byte < 0x80 ? String.fromCharCode(byte) : " ";
	}
	return head.match(META_CHARSET)?.[1] ?? null;
}

function decode(bytes: Uint8Array, contentType: string | null): string {
	const label =
		charsetOf(contentType) ?? sniffMetaCharset(bytes, contentType) ?? "utf-8";
	try {
		return new TextDecoder(label).decode(bytes);
	} catch {
		return new TextDecoder("utf-8").decode(bytes);
	}
}

async function readCapped(
	body: Response["body"],
	maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
	if (!body) return { bytes: new Uint8Array(0), truncated: false };
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	let truncated = false;
	while (true) {
		const result = await reader.read();
		if (result.done) break;
		const value: Uint8Array = result.value;
		const room = maxBytes - total;
		if (value.length > room) {
			chunks.push(value.subarray(0, room));
			total += room;
			truncated = true;
			await reader.cancel();
			break;
		}
		chunks.push(value);
		total += value.length;
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return { bytes, truncated };
}

export function createFetcher(opts: FetcherOptions): Fetcher {
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
	const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
	const blockPrivate = opts.network?.blockPrivate === true;
	if (
		blockPrivate &&
		opts.dispatcher &&
		opts.network?.trustDispatcher !== true
	) {
		throw new Error(
			"network.blockPrivate cannot be combined with a custom dispatcher",
		);
	}
	// A fetcher lives for one audit, so the guarded agent is kept for its lifetime.
	const ownAgent =
		!opts.dispatcher && blockPrivate
			? new Agent({
					connect: { lookup: createGuardedLookup(opts.network?.resolve) },
				})
			: undefined;
	const dispatcher = opts.dispatcher ?? ownAgent;
	const cache = new Map<string, Promise<HttpResult>>();

	async function load(
		startUrl: string,
		cap: number,
		external?: AbortSignal,
	): Promise<RawResult> {
		const timeout = AbortSignal.timeout(timeoutMs);
		const signal = external ? AbortSignal.any([timeout, external]) : timeout;
		let current = startUrl;
		try {
			for (let redirects = 0; ; redirects++) {
				if (blockPrivate) {
					const check = checkUrl(current);
					if (!check.ok) {
						return {
							kind: "error",
							url: startUrl,
							error: blockedMessage(check.reason),
							blocked: true,
						};
					}
				}
				const res = await fetch(current, {
					redirect: "manual",
					signal,
					dispatcher,
					headers: { "user-agent": opts.userAgent },
				});
				const location = res.headers.get("location");
				if (REDIRECT_STATUSES.has(res.status) && location) {
					await res.body?.cancel();
					if (redirects >= maxRedirects) {
						return {
							kind: "error",
							url: startUrl,
							error: `too many redirects (more than ${maxRedirects})`,
						};
					}
					current = new URL(location, current).href;
					continue;
				}
				const contentType = res.headers.get("content-type");
				const { bytes, truncated } = await readCapped(res.body, cap);
				return {
					kind: "response",
					url: current,
					status: res.status,
					contentType,
					headers: res.headers as unknown as Headers,
					bytes,
					truncated,
				};
			}
		} catch (err) {
			if (external?.aborted && !timeout.aborted) {
				return { kind: "error", url: startUrl, error: "request aborted" };
			}
			if (signal.aborted) {
				return {
					kind: "error",
					url: startUrl,
					error: `request timed out after ${timeoutMs} ms`,
				};
			}
			const cause = (err as { cause?: { message?: string } }).cause?.message;
			const message = err instanceof Error ? err.message : String(err);
			if (blockPrivate && cause?.startsWith(BLOCKED_PREFIX)) {
				return { kind: "error", url: startUrl, error: cause, blocked: true };
			}
			return {
				kind: "error",
				url: startUrl,
				error: cause ? `${message}: ${cause}` : message,
			};
		}
	}

	function toHttpResult(res: RawResult): HttpResult {
		if (res.kind === "error") return res;
		const { bytes, ...rest } = res;
		return { ...rest, body: decode(bytes, res.contentType) };
	}

	return {
		get(url, getOpts) {
			const key = new URL(url).href;
			if (getOpts) {
				return load(key, getOpts.maxBytes ?? maxBytes, getOpts.signal).then(
					toHttpResult,
				);
			}
			let pending = cache.get(key);
			if (!pending) {
				pending = load(key, maxBytes).then(toHttpResult);
				cache.set(key, pending);
			}
			return pending;
		},
		async getBytes(url, { maxBytes: cap, signal }) {
			const res = await load(new URL(url).href, cap, signal);
			if (res.kind === "error") return res;
			const { headers: _headers, ...rest } = res;
			return rest;
		},
		async close() {
			await ownAgent?.close();
		},
	};
}

export function isTextResource(res: HttpResult): boolean {
	if (res.kind !== "response" || res.status !== 200) return false;
	const type = res.contentType?.split(";")[0]?.trim().toLowerCase();
	if (type === "text/html" || type === "application/xhtml+xml") return false;
	const body = res.body.trim();
	if (body === "") return false;
	return !/^<(!doctype|html)/i.test(body);
}
