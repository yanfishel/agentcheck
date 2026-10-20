import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroBackdrop } from "@/components/landing/hero-backdrop";

describe("HeroBackdrop", () => {
	it("is decorative and lights cells placed on the grid", () => {
		const html = renderToStaticMarkup(<HeroBackdrop />);
		expect(html).toMatch(/^<div aria-hidden="true"/);
		const cells = [...html.matchAll(/class="hero-cell" style="([^"]*)"/g)];
		expect(cells.length).toBeGreaterThan(8);
		for (const [, style] of cells) {
			expect(style).toMatch(/--col:-?\d+;--row:\d+;animation-delay:[\d.]+s/);
		}
		// Every cell sits on its own grid square.
		const squares = cells.map(
			([, style]) => style?.match(/--col:-?\d+;--row:\d+/)?.[0],
		);
		expect(new Set(squares).size).toBe(cells.length);
	});
});
