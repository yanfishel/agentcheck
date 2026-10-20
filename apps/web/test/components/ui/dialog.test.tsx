// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui";

afterEach(cleanup);

describe("Dialog", () => {
	it("uses the title as the accessible name and requests close on Escape", async () => {
		const onOpenChange = vi.fn();
		render(
			<Dialog
				open
				onOpenChange={onOpenChange}
				title="Share this report"
				description="Anyone with the link can view it."
				actions={<button type="button">Done</button>}
			>
				<p>Body</p>
			</Dialog>,
		);
		expect(
			await screen.findByRole("dialog", { name: "Share this report" }),
		).toBeInTheDocument();
		expect(screen.getByText("Body")).toBeInTheDocument();
		await userEvent.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
	});

	it("requests close from the corner close button", async () => {
		const onOpenChange = vi.fn();
		render(
			<Dialog open onOpenChange={onOpenChange} title="Get badge">
				<p>Body</p>
			</Dialog>,
		);
		await userEvent.click(
			await screen.findByRole("button", { name: "Close dialog" }),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
	});
});
