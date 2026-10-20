import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, ButtonLink } from "@/components/ui";

describe("Button", () => {
	it("primary renders a pill with the accent fill and aria-busy while loading", () => {
		const html = renderToStaticMarkup(<Button loading>Save</Button>);
		expect(html).toContain('aria-busy="true"');
		expect(html).toContain("disabled=");
		expect(html).toContain("rounded-full");
		expect(html).toContain("bg-accent");
	});

	it("is not busy or disabled by default", () => {
		const html = renderToStaticMarkup(<Button>Save</Button>);
		expect(html).not.toContain("aria-busy");
		expect(html).not.toContain("disabled=");
	});

	it("ButtonLink renders an anchor with the same look", () => {
		const html = renderToStaticMarkup(
			<ButtonLink href="/x" variant="secondary">
				Go
			</ButtonLink>,
		);
		expect(html).toContain('href="/x"');
		expect(html).toContain("rounded-full");
	});
});
