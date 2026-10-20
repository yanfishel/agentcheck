// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ScreenshotThumb } from "@/components/report/screenshot-thumb";

afterEach(cleanup);

const sources = {
	small: "/api/shared/t1/screenshot",
	large: "/api/shared/t1/screenshot?size=large",
};

describe("ScreenshotThumb", () => {
	it("opens the large screenshot in a dialog", async () => {
		render(<ScreenshotThumb sources={sources} host="example.com" grade="B" />);
		const button = screen.getByRole("button", {
			name: "Open screenshot of example.com",
		});
		expect(button.querySelector("img")?.getAttribute("src")).toBe(
			sources.small,
		);
		await userEvent.click(button);
		const dialog = await screen.findByRole("dialog", { name: "example.com" });
		const large = screen.getByRole("img", {
			name: "Screenshot of example.com",
		});
		expect(dialog).toContainElement(large);
		expect(large.getAttribute("src")).toBe(sources.large);
		await userEvent.click(screen.getByRole("button", { name: "Close" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});
});
