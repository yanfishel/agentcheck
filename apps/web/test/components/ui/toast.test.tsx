// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "@/components/ui";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function Trigger() {
	const { toast } = useToast();
	return (
		<button type="button" onClick={() => toast("Saved")}>
			Save
		</button>
	);
}

describe("useToast", () => {
	it("shows a toast that disappears after 4 seconds", () => {
		vi.useFakeTimers();
		render(
			<ToastProvider>
				<Trigger />
			</ToastProvider>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		expect(screen.getByText("Saved")).toBeInTheDocument();
		act(() => {
			vi.advanceTimersByTime(4100);
		});
		expect(screen.queryByText("Saved")).toBeNull();
	});

	it("throws a clear error outside the provider", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
		spy.mockRestore();
	});
});
