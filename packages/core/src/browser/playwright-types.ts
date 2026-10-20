import type { RenderedPage } from "./types.ts";

/** Minimal structural subset of Playwright objects used by AgentCheck, so tests can fake them. */

export interface ResponseLike {
	status(): number;
	/** Optional so test fakes can omit it; Playwright always provides it. */
	headers?(): Record<string, string>;
}

export interface PageLike {
	goto(
		url: string,
		opts?: { waitUntil?: "load" | "domcontentloaded"; timeout?: number },
	): Promise<ResponseLike | null>;
	waitForLoadState(
		state: "load" | "networkidle",
		opts?: { timeout?: number },
	): Promise<void>;
	url(): string;
	title(): Promise<string>;
	content(): Promise<string>;
	evaluate<R>(fn: (() => R) | string): Promise<R>;
	close(): Promise<void>;
}

export interface CdpLike {
	send(method: string, params?: object): Promise<unknown>;
}

export interface ContextLike {
	newPage(): Promise<PageLike>;
	newCDPSession(page: PageLike): Promise<CdpLike>;
	close(): Promise<void>;
}

export interface ContextOptions {
	viewport?: { width: number; height: number };
	locale?: string;
	userAgent?: string;
}

export interface BrowserLike {
	version(): string;
	newContext(opts?: ContextOptions): Promise<ContextLike>;
	close(): Promise<void>;
	/** Optional: the browser process, used to kill a browser whose close() hangs. */
	process?(): { kill(): unknown } | null;
}

export type CollectedData = Pick<
	RenderedPage,
	"interactive" | "clickTraps" | "overlays" | "captcha" | "failures"
>;

export type Collect = (page: PageLike, cdp: CdpLike) => Promise<CollectedData>;
