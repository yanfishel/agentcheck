// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlockToggle } from "@/components/block-toggle";
import { ToastProvider } from "@/components/ui";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	refresh.mockReset();
});

function setup(props: { blocked?: boolean; isAdmin?: boolean } = {}) {
	render(
		<ToastProvider>
			<BlockToggle
				id="u1"
				email="user@example.com"
				blocked={props.blocked ?? false}
				isAdmin={props.isAdmin ?? false}
			/>
		</ToastProvider>,
	);
}

describe("BlockToggle", () => {
	it("BlockToggle asks for confirmation naming the email and PATCHes on confirm", async () => {
		fetchMock.mockResolvedValueOnce(Response.json({ blocked: true }));
		setup();
		await userEvent.click(
			screen.getByRole("button", { name: "Block user@example.com" }),
		);
		const dialog = await screen.findByRole("dialog", {
			name: "Block user@example.com?",
		});
		expect(dialog).toHaveTextContent("They will not be able to start audits.");
		expect(fetchMock).not.toHaveBeenCalled();
		await userEvent.click(screen.getByRole("button", { name: "Block user" }));
		expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/u1", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ blocked: true }),
		});
		expect(await screen.findByText("Blocked")).toBeInTheDocument();
		expect(refresh).toHaveBeenCalled();
	});

	it("asks to unblock a blocked user", async () => {
		fetchMock.mockResolvedValueOnce(Response.json({ blocked: false }));
		setup({ blocked: true });
		await userEvent.click(
			screen.getByRole("button", { name: "Unblock user@example.com" }),
		);
		const dialog = await screen.findByRole("dialog", {
			name: "Unblock user@example.com?",
		});
		expect(dialog).toHaveTextContent(
			"They will be able to start audits again.",
		);
		await userEvent.click(screen.getByRole("button", { name: "Unblock user" }));
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/admin/users/u1",
			expect.objectContaining({ body: JSON.stringify({ blocked: false }) }),
		);
		expect(await screen.findByText("Unblocked")).toBeInTheDocument();
	});

	it("BlockToggle is disabled for admins with the tooltip text", async () => {
		setup({ isAdmin: true });
		const button = screen.getByRole("button", {
			name: "Block user@example.com",
		});
		expect(button).toHaveAttribute("aria-disabled", "true");
		await userEvent.tab();
		expect(button).toHaveFocus();
		expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Admins cannot be blocked",
		);
		await userEvent.click(button);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
