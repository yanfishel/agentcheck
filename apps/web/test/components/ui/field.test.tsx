import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, Input } from "@/components/ui";

describe("Field", () => {
	it("shows the error with role=alert and marks the input invalid", () => {
		const html = renderToStaticMarkup(
			<Field label="URL" error="Enter a valid URL">
				<Input name="url" />
			</Field>,
		);
		expect(html).toContain('role="alert"');
		expect(html).toContain("Enter a valid URL");
		expect(html).toContain('aria-invalid="true"');
	});

	it("renders the label and hint without an alert when valid", () => {
		const html = renderToStaticMarkup(
			<Field label="URL" hint="Public address">
				<Input name="url" mono />
			</Field>,
		);
		expect(html).toContain("URL");
		expect(html).toContain("Public address");
		expect(html).toContain("font-mono");
		expect(html).not.toContain('role="alert"');
	});

	it("stacks hint and error in one slot so the layout keeps its height", () => {
		const render = (error?: string) =>
			renderToStaticMarkup(
				<Field label="URL" hint="Public address" error={error} stackMessages>
					<Input name="url" />
				</Field>,
			);
		const slot = /<div class="grid[^"]*">(.*)<\/div><\/div>$/;
		const valid = render().match(slot)?.[1] ?? "";
		expect(valid).toContain("Public address");
		expect(valid).not.toContain("invisible");

		const invalid = render("Enter a valid URL").match(slot)?.[1] ?? "";
		// The hint stays in the slot (hidden) and the alert shares its cell.
		expect(invalid).toMatch(/class="[^"]*invisible[^"]*"[^>]*>Public address/);
		expect(invalid).toContain('role="alert"');
	});
});
