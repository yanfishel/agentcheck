// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CategoryTiles } from "@/components/report/category-tiles";

afterEach(cleanup);

const tiles = [
	{ id: "ai-manifests", title: "AI Manifests", status: "scored", score: 80 },
	{ id: "bot-access", title: "Bot Access", status: "scored", score: 100 },
	{
		id: "agentic-actionability",
		title: "Agentic Actionability",
		status: "skipped",
		score: null,
	},
] as Parameters<typeof CategoryTiles>[0]["categories"];

function arc(name: RegExp) {
	return screen
		.getByRole("link", { name })
		.querySelector("circle[stroke-linecap]");
}

describe("CategoryTiles", () => {
	it("shows each score as a gauge in its status colour, sized by the score", () => {
		render(<CategoryTiles categories={tiles} />);
		const manifests = arc(/AI Manifests/);
		expect(manifests?.getAttribute("class")).toContain("text-warn");
		const r = Number(manifests?.getAttribute("r"));
		const length = Number(
			manifests?.getAttribute("stroke-dasharray")?.split(" ")[0],
		);
		expect(length / (2 * Math.PI * r)).toBeCloseTo(0.8, 2);
		expect(arc(/Bot Access/)?.getAttribute("class")).toContain("text-pass");
	});

	it("draws an empty gauge for a skipped category and says so", () => {
		render(<CategoryTiles categories={tiles} />);
		const link = screen.getByRole("link", { name: /Agentic Actionability/ });
		expect(link.querySelector("circle[stroke-linecap]")).toBeNull();
		expect(link).toHaveTextContent("Skipped");
	});
});
