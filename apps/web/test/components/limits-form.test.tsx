// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LimitsForm } from "@/components/limits-form";
import { ToastProvider } from "@/components/ui";

const initial = {
	anonQuickPerHour: 5,
	userFullPerDay: 10,
	userQuickPerDay: 50,
	hostPer10Min: 20,
	hostRunningMax: 2,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function setup() {
	render(
		<ToastProvider>
			<LimitsForm initial={initial} />
		</ToastProvider>,
	);
}

describe("LimitsForm", () => {
	it("LimitsForm shows a toast on save and inline errors on 400", async () => {
		fetchMock.mockResolvedValueOnce(Response.json(initial));
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Save limits" }));
		expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(initial),
		});
		expect(await screen.findByText("Limits saved")).toBeInTheDocument();
		expect(screen.queryByRole("alert")).toBeNull();

		fetchMock.mockResolvedValueOnce(
			Response.json(
				{ error: "hostRunningMax must be at least 1" },
				{ status: 400 },
			),
		);
		await userEvent.click(screen.getByRole("button", { name: "Save limits" }));
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("hostRunningMax must be at least 1");
		expect(screen.getByLabelText("Running checks per site")).toHaveAttribute(
			"aria-invalid",
			"true",
		);
	});

	it("shows a form-level alert for errors that name no field", async () => {
		fetchMock.mockResolvedValueOnce(
			Response.json({ error: "Forbidden" }, { status: 403 }),
		);
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Save limits" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
	});
});
