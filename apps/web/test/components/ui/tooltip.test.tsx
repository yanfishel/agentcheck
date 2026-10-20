// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Tooltip } from "@/components/ui";

afterEach(cleanup);

describe("Tooltip", () => {
	it("shows on focus and hides on blur", async () => {
		render(
			<>
				<Tooltip content="Copy the link">
					<button type="button">Copy</button>
				</Tooltip>
				<button type="button">Other</button>
			</>,
		);
		await userEvent.tab();
		expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Copy the link",
		);
		await userEvent.tab();
		await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
	});
});
