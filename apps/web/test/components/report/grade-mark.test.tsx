// @vitest-environment jsdom
import type { AuditResult } from "@agentcheck/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GradeMark } from "@/components/report/grade-mark";
import { ScoreBand } from "@/components/report/score-band";

const parse = (html: string) =>
	new DOMParser().parseFromString(html, "text/html");

describe("GradeMark", () => {
	it("puts the grade in the brand frame with the spark", () => {
		const doc = parse(renderToStaticMarkup(<GradeMark grade="A" />));
		const svg = doc.querySelector("svg");
		expect(svg?.getAttribute("role")).toBe("img");
		expect(svg?.getAttribute("aria-label")).toBe("Grade A");
		expect(doc.querySelector(".ac-frame")).not.toBeNull();
		expect(doc.querySelector(".ac-spark")).not.toBeNull();
		expect(doc.querySelector("text")?.textContent).toBe("A");
	});

	it("sets two-character grades smaller so they fit the frame", () => {
		const size = (grade: "A" | "A+") =>
			Number(
				parse(renderToStaticMarkup(<GradeMark grade={grade} />))
					.querySelector("text")
					?.getAttribute("font-size"),
			);
		expect(size("A+")).toBeLessThan(size("A"));
	});

	it.each([
		["A+", "text-band-pass"],
		["C", "text-band-warn"],
		["F", "text-band-fail"],
	] as const)(
		"colours the frame and letters of %s, not the spark",
		(grade, tone) => {
			const doc = parse(renderToStaticMarkup(<GradeMark grade={grade} />));
			expect(doc.querySelector(".ac-frame")?.classList.contains(tone)).toBe(
				true,
			);
			expect(doc.querySelector("text")?.classList.contains(tone)).toBe(true);
			expect(doc.querySelector(".ac-spark")?.getAttribute("class")).toBe(
				"ac-spark",
			);
		},
	);
});

describe("ScoreBand", () => {
	it("shows the grade as the mark, with no separate logo in the corner", () => {
		const result = {
			target: "https://example.com/",
			finalUrl: "https://example.com/",
			score: 92,
			grade: "A",
		} as AuditResult;
		const doc = parse(
			renderToStaticMarkup(<ScoreBand result={result} chips={null} />),
		);
		// The phone and the sm-up placements; CSS shows exactly one.
		expect(doc.querySelectorAll("svg[aria-label='Grade A']")).toHaveLength(2);
		expect(doc.querySelector(".ac-letters")).toBeNull();
	});
});
