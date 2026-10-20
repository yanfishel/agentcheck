// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeMenu } from "@/components/theme-menu";

afterEach(() => {
	cleanup();
	localStorage.clear();
	delete document.documentElement.dataset.theme;
});

async function open() {
	await userEvent.click(screen.getByRole("button", { name: "Theme" }));
	return screen.findAllByRole("menuitemradio");
}

describe("ThemeMenu", () => {
	it("offers Light, Dark and System with System checked by default", async () => {
		render(<ThemeMenu className="" />);
		const items = await open();
		expect(items.map((item) => item.textContent)).toEqual([
			"Light",
			"Dark",
			"System",
		]);
		expect(
			screen.getByRole("menuitemradio", { name: "System" }),
		).toHaveAttribute("aria-checked", "true");
	});

	it("pins the chosen theme and checks it next time", async () => {
		render(<ThemeMenu className="" />);
		await open();
		await userEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }));
		expect(document.documentElement.dataset.theme).toBe("dark");
		expect(localStorage.getItem("theme")).toBe("dark");
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		await open();
		expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
			"aria-checked",
			"true",
		);
	});

	it("starts from a theme the head script already applied", async () => {
		document.documentElement.dataset.theme = "light";
		render(<ThemeMenu className="" />);
		await open();
		expect(
			screen.getByRole("menuitemradio", { name: "Light" }),
		).toHaveAttribute("aria-checked", "true");
	});
});
