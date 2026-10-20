import type { Resolve } from "../net/guarded-lookup.ts";
import type { GuardedProxyOptions } from "../net/guarded-proxy.ts";
import { startGuardedProxy } from "../net/guarded-proxy.ts";
import { blockedMessage, checkUrl } from "../net/policy.ts";
import {
	BLOCKED_REASON,
	createBrowserRenderer,
	type RendererOptions,
} from "./render.ts";
import type { BrowserRenderer, RenderOutcome } from "./types.ts";

export interface GuardedBrowserRendererOptions
	extends Omit<RendererOptions, "proxyServer" | "sandbox">,
		GuardedProxyOptions {
	/** @internal for tests; the service must leave this unset — widening it voids the guard. */
	resolve?: Resolve;
	/** Proxy factory; injectable so tests can observe the proxy lifecycle. */
	startProxy?: typeof startGuardedProxy;
}

/**
 * A browser renderer whose traffic goes through a per-render guarded proxy, so
 * private and loopback addresses are unreachable from the page and its subresources.
 */
export function createGuardedBrowserRenderer(
	opts: GuardedBrowserRendererOptions = {},
): BrowserRenderer {
	const {
		resolve,
		isBlocked,
		allowPorts,
		resolveTimeoutMs,
		startProxy,
		...rest
	} = opts;
	const start = startProxy ?? startGuardedProxy;
	return {
		guarded: true,
		async render(url, renderOpts): Promise<RenderOutcome> {
			const check = checkUrl(url, { allowPorts });
			if (!check.ok) {
				return {
					kind: "unavailable",
					reason: blockedMessage(check.reason),
					blocked: true,
				};
			}
			const proxy = await start({
				resolve,
				isBlocked,
				allowPorts,
				resolveTimeoutMs,
			});
			let offendingReason: string | undefined;
			try {
				const outcome = await createBrowserRenderer({
					...rest,
					// The service never runs Chromium without its sandbox.
					sandbox: true,
					proxyServer: proxy.url,
					isUrlAllowed: (u) => {
						const verdict = checkUrl(u, { allowPorts });
						const reason = verdict.ok
							? proxy.refused(verdict.url.hostname)
							: verdict.reason;
						if (reason === undefined) return true;
						offendingReason = reason;
						return false;
					},
				}).render(url, renderOpts);
				if (
					outcome.kind === "unavailable" &&
					outcome.reason === BLOCKED_REASON
				) {
					// ERR_TUNNEL_CONNECTION_FAILED also covers plain 502s; only report a
					// policy block when the proxy actually refused something.
					// Browsers make unrelated background requests, so the last refusal
					// overall is only a fallback after the hosts that actually mattered.
					const refusal =
						proxy.refused(check.url.hostname) ??
						offendingReason ??
						proxy.refused();
					if (refusal === undefined) {
						return {
							kind: "unavailable",
							reason: `Browser navigation failed: could not connect to ${check.url.hostname}`,
						};
					}
					return {
						kind: "unavailable",
						reason: blockedMessage(refusal),
						blocked: true,
					};
				}
				return outcome;
			} finally {
				await proxy.close();
			}
		},
	};
}
