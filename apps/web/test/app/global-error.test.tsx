import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GlobalError from "@/app/global-error";

describe("global error page", () => {
	const html = renderToStaticMarkup(
		<GlobalError error={new Error("boom")} reset={() => {}} />,
	);

	it("renders its own document, since it replaces the root layout", () => {
		expect(html).toMatch(/^<html lang="en"/);
		expect(html).toContain("<body");
	});

	it("says what happened and offers a way out", () => {
		expect(html).toContain("Something went wrong.");
		expect(html).toContain("Try again");
		expect(html).toContain('href="/"');
	});

	it("never shows the error message", () => {
		expect(html).not.toContain("boom");
	});
});
