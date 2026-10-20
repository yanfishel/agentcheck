// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeightRing } from "@/components/landing/weight-ring";

function segments(id: Parameters<typeof WeightRing>[0]["id"]) {
	const doc = new DOMParser().parseFromString(
		renderToStaticMarkup(<WeightRing id={id} />),
		"image/svg+xml",
	);
	return {
		label: doc.documentElement.getAttribute("aria-label"),
		circles: [...doc.querySelectorAll("circle")].map((circle) => ({
			className: circle.getAttribute("class") ?? "",
			length: Number(circle.getAttribute("stroke-dasharray")?.split(" ")[0]),
			offset: Number(circle.getAttribute("stroke-dashoffset")),
		})),
	};
}

describe("WeightRing", () => {
	it("draws every category in a fixed place and highlights only the current one", () => {
		const bots = segments("bot-access");
		const manifests = segments("ai-manifests");
		expect(bots.circles).toHaveLength(4);
		// Each segment sits in the same place whichever card it is on: its centre
		// along the ring does not move, only the highlighted one is wider.
		const centre = (c: { length: number; offset: number }) =>
			(-c.offset + c.length / 2).toFixed(2);
		expect(bots.circles.map(centre)).toEqual(manifests.circles.map(centre));
		const full = bots.circles.filter(
			(c) => !c.className.includes("opacity-15"),
		);
		expect(full).toHaveLength(1);
		expect(full[0]?.className).toContain("text-cat-bots");
		expect(bots.label).toBe("20% of the score");
	});

	it("follows the scoring order clockwise from the top", () => {
		const { circles } = segments("bot-access");
		const starts = circles.map((c) => -c.offset);
		// Manifests (30%) first, then Bots, Semantics, Actions, as in CATEGORIES.
		expect(circles.map((c) => c.className.split(" ")[0])).toEqual([
			"text-cat-manifests",
			"text-cat-bots",
			"text-cat-semantics",
			"text-cat-actions",
		]);
		expect([...starts].sort((a, b) => a - b)).toEqual(starts);
	});

	it("sizes segments by weight (30% is longer than 20%)", () => {
		const { circles } = segments("ai-manifests");
		const byClass = (name: string) =>
			circles.find((c) => c.className.includes(name))?.length ?? 0;
		expect(byClass("text-cat-manifests")).toBeGreaterThan(
			byClass("text-cat-bots"),
		);
		expect(byClass("text-cat-semantics")).toBeCloseTo(
			byClass("text-cat-actions"),
		);
	});
});
