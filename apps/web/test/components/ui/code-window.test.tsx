// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type CodeTab, CodeWindow } from "@/components/ui";

afterEach(cleanup);

const tabs: [CodeTab, CodeTab] = [
	{
		label: "zsh",
		content: "npx agentcheck-dev",
		copy: "npx agentcheck-dev",
		copyLabel: "Copy command",
	},
	{
		label: "ci.yml",
		content: "runs-on: ubuntu",
		copy: "runs-on: ubuntu",
		copyLabel: "Copy workflow",
	},
];

describe("CodeWindow", () => {
	it("shows the first tab and keeps the others in the document", () => {
		render(<CodeWindow label="Examples" tabs={tabs} />);
		expect(screen.getByRole("tab", { name: "zsh" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(screen.getByText("npx agentcheck-dev")).toBeVisible();
		// The inactive panel stays in the layout (one height for all tabs) but is
		// inert and marked hidden, which the stylesheet turns into visibility: hidden.
		const inactive = screen
			.getByText("runs-on: ubuntu", { selector: "code" })
			.closest('[role="tabpanel"]');
		expect(inactive).toHaveAttribute("data-hidden");
		expect(inactive).toHaveAttribute("inert");
		expect(
			screen.getByRole("button", { name: "Copy command" }),
		).toBeInTheDocument();
	});

	it("switches tabs and copies the active one", async () => {
		render(<CodeWindow label="Examples" tabs={tabs} />);
		await userEvent.click(screen.getByRole("tab", { name: "ci.yml" }));
		expect(
			screen.getByText("runs-on: ubuntu", { selector: "code" }),
		).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Copy workflow" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Copy command" })).toBeNull();
	});
});

describe("CodeWindow, controlled", () => {
	it("controlled value selects a tab", async () => {
		const onValueChange = vi.fn();
		render(
			<CodeWindow
				label="Examples"
				tabs={tabs}
				value={1}
				onValueChange={onValueChange}
			/>,
		);
		expect(screen.getByRole("tab", { name: "ci.yml" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(
			screen.getByRole("button", { name: "Copy workflow" }),
		).toBeInTheDocument();
		await userEvent.click(screen.getByRole("tab", { name: "zsh" }));
		expect(onValueChange).toHaveBeenCalledWith(0);
	});

	it("renders per-tab actions", async () => {
		render(
			<CodeWindow
				label="Examples"
				tabs={[
					{ ...tabs[0], actions: <a href="/zsh">Download zsh</a> },
					{ ...tabs[1], actions: <a href="/ci">Download ci</a> },
				]}
			/>,
		);
		expect(screen.getByRole("link", { name: "Download zsh" })).toBeVisible();
		expect(screen.queryByRole("link", { name: "Download ci" })).toBeNull();
		await userEvent.click(screen.getByRole("tab", { name: "ci.yml" }));
		expect(screen.getByRole("link", { name: "Download ci" })).toBeVisible();
		expect(screen.queryByRole("link", { name: "Download zsh" })).toBeNull();
	});
});

describe("CodeWindow on a narrow screen", () => {
	it("offers a file picker that switches the tab", async () => {
		render(<CodeWindow label="Examples" tabs={tabs} />);
		await userEvent.click(
			screen.getByRole("button", { name: "Examples: zsh, 1 of 2" }),
		);
		await userEvent.click(
			await screen.findByRole("menuitemradio", { name: "ci.yml" }),
		);
		expect(screen.getByRole("tab", { name: "ci.yml" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(
			screen.getByRole("button", { name: "Examples: ci.yml, 2 of 2" }),
		).toBeInTheDocument();
	});

	it("has no picker for a single tab", () => {
		render(<CodeWindow label="Examples" tabs={[tabs[0]]} />);
		expect(screen.queryByRole("button", { name: /1 of 1/ })).toBeNull();
	});

	it("hides the button labels on a phone, not their names", () => {
		render(<CodeWindow label="Examples" tabs={tabs} />);
		const copy = screen.getByRole("button", { name: "Copy command" });
		expect(
			copy.querySelector('span[class~="max-sm:sr-only"]')?.textContent,
		).toBe("Copy");
	});

	it("stacks every panel in one cell, so the window keeps the tallest height", () => {
		const { container } = render(<CodeWindow label="Examples" tabs={tabs} />);
		const panels = container.querySelectorAll('[role="tabpanel"]');
		expect(panels).toHaveLength(2);
		for (const panel of panels) {
			expect(panel.className).toContain("[grid-area:1/1]");
		}
	});
});
