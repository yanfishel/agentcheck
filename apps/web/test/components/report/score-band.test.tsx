// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { gradeStroke, ScoreRing } from "@/components/report/score-band";

function ring(score: number, grade: Parameters<typeof gradeStroke>[0]) {
	const doc = new DOMParser().parseFromString(
		renderToStaticMarkup(<ScoreRing score={score} grade={grade} />),
		"text/html",
	);
	return doc.querySelectorAll("circle");
}

describe("ScoreRing", () => {
	it("colours the arc in three steps: green A, yellow B to D, red F", () => {
		expect(gradeStroke("A+")).toBe("text-band-pass");
		expect(gradeStroke("A")).toBe("text-band-pass");
		for (const grade of ["B", "C", "D"] as const) {
			expect(gradeStroke(grade)).toBe("text-band-warn");
		}
		expect(gradeStroke("F")).toBe("text-band-fail");
	});

	it("draws a track and a round-capped arc as long as the score", () => {
		const [track, arc] = ring(92, "A");
		expect(track).toBeDefined();
		expect(arc?.getAttribute("stroke-linecap")).toBe("round");
		expect(arc?.getAttribute("class")).toContain("text-band-pass");
		const circumference = 2 * Math.PI * Number(arc?.getAttribute("r"));
		const length = Number(arc?.getAttribute("stroke-dasharray")?.split(" ")[0]);
		expect(length / circumference).toBeCloseTo(0.92, 2);
	});

	it("draws no arc for a zero score", () => {
		expect(ring(0, "F")).toHaveLength(1);
	});
});
