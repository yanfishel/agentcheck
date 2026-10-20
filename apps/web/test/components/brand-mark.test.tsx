import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandMark } from "@/components/brand-mark";

describe("BrandMark", () => {
	it("renders the idle state, hidden from assistive technology, by default", () => {
		const html = renderToStaticMarkup(<BrandMark />);
		expect(html).toContain('class="ac ac--idle"');
		expect(html).toContain('aria-hidden="true"');
		expect(html).not.toContain("aria-label");
	});

	it("exposes a label as an image when one is given", () => {
		const html = renderToStaticMarkup(
			<BrandMark state="failed" label="Audit failed" className="size-14" />,
		);
		expect(html).toContain('class="ac ac--failed size-14"');
		expect(html).toContain('role="img"');
		expect(html).toContain('aria-label="Audit failed"');
		expect(html).not.toContain("aria-hidden");
	});

	it("keeps the moving part addressable for the state animations", () => {
		const html = renderToStaticMarkup(<BrandMark state="running" />);
		expect(html).toContain('class="ac-spark"');
		expect(html).toContain('class="ac-frame"');
		expect(html).toContain('class="ac-letters"');
	});
});
