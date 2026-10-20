import type { BrowserLike } from "./playwright-types.ts";
import { UNAVAILABLE_REASON } from "./types.ts";

export type Engine = "chrome" | "chromium";

/**
 * `timeoutMs` is the launch timeout (the remaining render budget); `sandbox`
 * true turns Chromium's own sandbox on (otherwise Playwright's default, off).
 */
export type Launcher = (
	engine: Engine,
	timeoutMs?: number,
	proxyServer?: string,
	sandbox?: boolean,
) => Promise<BrowserLike>;

export type LaunchResult =
	| { browser: BrowserLike; engine: Engine; version: string }
	| { kind: "unavailable"; reason: string };

const defaultLauncher: Launcher = async (
	engine,
	timeoutMs,
	proxyServer,
	sandbox,
) => {
	const { chromium } = await import("playwright-core");
	// The only cast: playwright's Browser is a structural superset of BrowserLike.
	return (await chromium.launch({
		channel: engine === "chrome" ? "chrome" : undefined,
		headless: true,
		...(sandbox === true && { chromiumSandbox: true }),
		...(proxyServer === undefined
			? {}
			: {
					// "<-loopback>" makes Chrome send loopback traffic through the proxy too.
					proxy: { server: proxyServer, bypass: "<-loopback>" },
					args: [
						"--disable-quic",
						"--webrtc-ip-handling-policy=disable_non_proxied_udp",
						"--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
					],
				}),
		...(timeoutMs === undefined ? {} : { timeout: Math.max(1, timeoutMs) }),
	})) as unknown as BrowserLike;
};

export async function launchBrowser(
	launcher: Launcher = defaultLauncher,
	remainingMs?: () => number,
	proxyServer?: string,
	sandbox?: boolean,
): Promise<LaunchResult> {
	for (const engine of ["chrome", "chromium"] as const) {
		try {
			const browser = await launcher(
				engine,
				remainingMs?.(),
				proxyServer,
				sandbox,
			);
			return { browser, engine, version: browser.version() };
		} catch {
			// try the next engine
		}
	}
	return { kind: "unavailable", reason: UNAVAILABLE_REASON };
}
