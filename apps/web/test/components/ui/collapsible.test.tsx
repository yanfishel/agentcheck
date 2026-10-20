// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Collapsible } from "@/components/ui";

afterEach(cleanup);

describe("Collapsible", () => {
	it("toggles its panel", async () => {
		render(
			<Collapsible trigger="Details">
				<p>Hidden text</p>
			</Collapsible>,
		);
		const trigger = screen.getByRole("button", { name: "Details" });
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByText("Hidden text")).toBeNull();
		await userEvent.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(await screen.findByText("Hidden text")).toBeVisible();
	});
});

describe("Collapsible as an accordion item", () => {
	it("wraps the trigger in a heading and keeps a closed panel findable", () => {
		const { container } = render(
			<Collapsible trigger="Bots" heading="h3" hiddenUntilFound>
				<p>Kept text</p>
			</Collapsible>,
		);
		expect(
			screen.getByRole("heading", { level: 3, name: "Bots" }),
		).toBeInTheDocument();
		expect(container.innerHTML).toContain("Kept text");
		expect(container.querySelector('[hidden="until-found"]')).not.toBeNull();
	});
});
