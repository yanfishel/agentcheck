import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckRow, foldDetails } from "@/components/report/check-row";

describe("foldDetails", () => {
	it("folds repeated details into one line with a count, keeping first-seen order", () => {
		expect(
			foldDetails([
				"slider: <div.mantine-focus-auto>",
				"button: <div.menu>",
				"slider: <div.mantine-focus-auto>",
			]),
		).toEqual([
			{ text: "slider: <div.mantine-focus-auto>", count: 2 },
			{ text: "button: <div.menu>", count: 1 },
		]);
	});

	it("keeps an empty list empty", () => {
		expect(foldDetails([])).toEqual([]);
	});
});

describe("CheckRow in a skipped category", () => {
	const skipped = {
		id: "accessible-names",
		title: "Accessible names",
		weight: 40,
		status: "skip" as const,
		message: "Page did not finish rendering within 30 s",
	};

	it("shows the check's title, not the category's reason again", () => {
		const html = renderToStaticMarkup(
			<CheckRow
				check={skipped}
				sectionReason="Page did not finish rendering within 30 s"
			/>,
		);
		expect(html).toContain("Accessible names");
		expect(html).not.toContain("did not finish rendering");
	});

	it("keeps a skip message of its own", () => {
		const html = renderToStaticMarkup(
			<CheckRow
				check={{ ...skipped, message: "No forms on the page" }}
				sectionReason="Page did not finish rendering within 30 s"
			/>,
		);
		expect(html).toContain("No forms on the page");
	});
});
