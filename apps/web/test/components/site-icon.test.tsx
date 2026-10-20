// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteIcon } from "@/components/site-icon";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

/** An image that already finished loading before React attached onError. */
function preloaded(decode: () => Promise<void>) {
	vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
	Object.defineProperty(HTMLImageElement.prototype, "decode", {
		configurable: true,
		writable: true,
		value: decode,
	});
}

describe("SiteIcon", () => {
	it("renders the image with empty alt when a source is given", () => {
		const { container } = render(
			<SiteIcon src="/api/audits/a1/favicon" tone="band" />,
		);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("/api/audits/a1/favicon");
		expect(img?.getAttribute("alt")).toBe("");
		expect(container.querySelector("svg")).toBeNull();
	});

	it("renders the globe without a source", () => {
		const { container } = render(<SiteIcon tone="card" />);
		expect(container.querySelector("img")).toBeNull();
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("aria-hidden")).toBe("true");
		expect(svg?.getAttribute("class")).toContain("text-muted");
	});

	it("colours the band globe for the plum band", () => {
		const { container } = render(<SiteIcon tone="band" />);
		expect(container.querySelector("svg")?.getAttribute("class")).toContain(
			"text-accent-fg/70",
		);
	});

	it("swaps to the globe when the image fails", () => {
		const { container } = render(
			<SiteIcon src="/api/audits/a1/favicon" tone="card" />,
		);
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
		fireEvent.error(img as HTMLImageElement);
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
			"true",
		);
	});

	describe("an image settled before hydration", () => {
		afterEach(() => {
			// biome-ignore lint/suspicious/noExplicitAny: removing the test stub
			delete (HTMLImageElement.prototype as any).decode;
		});

		it("falls back to the globe when it cannot be decoded", async () => {
			preloaded(() => Promise.reject(new Error("broken")));
			const { container } = render(
				<SiteIcon src="/api/audits/a1/favicon" tone="band" />,
			);
			await vi.waitFor(() => {
				expect(container.querySelector("img")).toBeNull();
			});
			expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		});

		it("keeps the image when it decodes", async () => {
			const decode = vi.fn(() => Promise.resolve());
			preloaded(decode);
			const { container } = render(
				<SiteIcon src="/api/audits/a1/favicon" tone="band" />,
			);
			await vi.waitFor(() => expect(decode).toHaveBeenCalled());
			await Promise.resolve();
			expect(container.querySelector("img")).not.toBeNull();
			expect(container.querySelector("svg")).toBeNull();
		});
	});
});
