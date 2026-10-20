// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryThumb } from "@/components/history-thumb";

const html = renderToStaticMarkup(
	<HistoryThumb screenshotId="B" href="/audits/A">
		<span data-testid="seal">92</span>
	</HistoryThumb>,
);
const doc = new DOMParser().parseFromString(html, "text/html");

describe("HistoryThumb", () => {
	it("renders the small screenshot lazily with empty alt", () => {
		const img = doc.querySelector('img[src="/api/audits/B/screenshot"]');
		expect(img?.getAttribute("loading")).toBe("lazy");
		expect(img?.getAttribute("alt")).toBe("");
	});

	it("links the image to the audit, hidden from assistive tech", () => {
		const link = doc.querySelector('a[href="/audits/A"]');
		expect(link?.getAttribute("tabindex")).toBe("-1");
		expect(link?.getAttribute("aria-hidden")).toBe("true");
		expect(link?.querySelector("img")).not.toBeNull();
	});

	it("keeps the seal outside the aria-hidden link", () => {
		const seal = doc.querySelector('[data-testid="seal"]');
		expect(seal?.textContent).toBe("92");
		expect(seal?.closest("[aria-hidden]")).toBeNull();
		expect(seal?.closest("a")).toBeNull();
	});

	it("draws a same-size tile with the site icon when there is no screenshot", () => {
		const tile = new DOMParser().parseFromString(
			renderToStaticMarkup(
				<HistoryThumb
					screenshotId={null}
					faviconSrc="/api/audits/C/favicon"
					href="/audits/A"
				>
					<span data-testid="seal">92</span>
				</HistoryThumb>,
			),
			"text/html",
		);
		expect(tile.querySelector('img[src$="/screenshot"]')).toBeNull();
		expect(
			tile.querySelector('img[src="/api/audits/C/favicon"]'),
		).not.toBeNull();
		expect(tile.querySelector('[data-testid="seal"]')).not.toBeNull();
	});
});
