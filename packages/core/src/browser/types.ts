export const SCREENSHOT_LARGE = { width: 1280, height: 800 } as const;
export const SCREENSHOT_SMALL = { width: 416, height: 260 } as const;

/** First-screen capture of the rendered page, handed to an opt-in callback. */
export interface Screenshot {
	contentType: "image/webp";
	/** SCREENSHOT_LARGE */
	large: Uint8Array;
	/** SCREENSHOT_SMALL */
	small: Uint8Array;
}

export interface ElementInfo {
	/** Short element description, at most 100 characters. */
	element: string;
}

export interface InteractiveNode extends ElementInfo {
	role: string;
	name: string;
}

export interface OverlayInfo extends ElementInfo {
	/** Fraction of the viewport covered, 0..1. */
	coverage: number;
	coversCentre: boolean;
}

export interface CaptchaInfo {
	markers: string[];
	blocking: boolean;
	reason?: string;
}

export interface RenderedPage {
	kind: "rendered";
	engine: "chrome" | "chromium";
	version: string;
	renderMs: number;
	status: number;
	finalUrl: string;
	interactive: InteractiveNode[];
	clickTraps: ElementInfo[];
	overlays: OverlayInfo[];
	captcha: CaptchaInfo;
	/** Reason text of a collection half that failed; its data is then empty, not trustworthy. */
	failures?: { accessibility?: string; dom?: string };
}

export type RenderOutcome =
	| RenderedPage
	| {
			kind: "unavailable";
			reason: string;
			/** Set when the network guard refused the target (the reason starts with BLOCKED_PREFIX). */
			blocked?: true;
	  };

export interface BrowserRenderer {
	/** Set by createGuardedBrowserRenderer(): all traffic goes through the guarded proxy. */
	readonly guarded?: true;
	/** Set by disabledRenderer(): never opens a browser. */
	readonly disabled?: true;
	render(url: string, opts: { userAgent?: string }): Promise<RenderOutcome>;
}

export const UNAVAILABLE_REASON =
	"No Chromium-based browser found; install Google Chrome or run: npx playwright install chromium";

export const NOT_ENABLED_REASON = "Browser checks not enabled";

export const DISABLED_REASON = "Browser checks disabled (--no-browser)";

export function disabledRenderer(reason?: string): BrowserRenderer {
	return {
		disabled: true,
		async render() {
			return { kind: "unavailable", reason: reason ?? DISABLED_REASON };
		},
	};
}
