import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chip, statusTone } from "@/components/ui";

describe("Chip", () => {
	it("statusTone maps the four statuses", () => {
		expect(statusTone("queued")).toBe("accent");
		expect(statusTone("running")).toBe("warn");
		expect(statusTone("done")).toBe("pass");
		expect(statusTone("failed")).toBe("fail");
	});

	it("renders a pill in the requested tone", () => {
		const html = renderToStaticMarkup(<Chip tone="pass">Done</Chip>);
		expect(html).toContain("rounded-full");
		expect(html).toContain("text-pass");
		expect(html).toContain("Done");
	});
});

describe("Chip on the band", () => {
	it("uses the accent-fg text over a translucent fill", () => {
		const html = renderToStaticMarkup(<Chip tone="band">Quick</Chip>);
		expect(html).toContain("bg-accent-fg/15 text-accent-fg");
	});
});
