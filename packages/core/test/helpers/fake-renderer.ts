import type {
	BrowserRenderer,
	RenderedPage,
	RenderOutcome,
} from "../../src/browser/types.ts";

export function renderedPage(
	overrides: Partial<RenderedPage> = {},
): RenderedPage {
	return {
		kind: "rendered",
		engine: "chrome",
		version: "1.0",
		renderMs: 1000,
		status: 200,
		finalUrl: "https://example.com/",
		interactive: [],
		clickTraps: [],
		overlays: [],
		captcha: { markers: [], blocking: false },
		...overrides,
	};
}

export function fakeRenderer(
	outcome: RenderOutcome,
): BrowserRenderer & { calls: Array<{ url: string; userAgent?: string }> } {
	const calls: Array<{ url: string; userAgent?: string }> = [];
	return {
		calls,
		async render(url, opts) {
			calls.push({ url, userAgent: opts.userAgent });
			return outcome;
		},
	};
}
