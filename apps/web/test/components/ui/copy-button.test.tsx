// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "@/components/ui";

afterEach(cleanup);

describe("CopyButton", () => {
	it("copies with the clipboard API and swaps the label", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
		const onCopied = vi.fn();
		render(<CopyButton text="hello" onCopied={onCopied} />);
		await userEvent.click(screen.getByRole("button", { name: "Copy" }));
		expect(writeText).toHaveBeenCalledWith("hello");
		expect(
			await screen.findByRole("button", { name: "Copied" }),
		).toBeInTheDocument();
		expect(onCopied).toHaveBeenCalledOnce();
	});

	it("falls back to selecting the text when the clipboard API is missing", async () => {
		Object.defineProperty(navigator, "clipboard", {
			value: undefined,
			configurable: true,
		});
		const onCopied = vi.fn();
		render(<CopyButton text="hello" onCopied={onCopied} />);
		await userEvent.click(screen.getByRole("button", { name: "Copy" }));
		expect(onCopied).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
	});

	it("uses a distinct accessible name while keeping the visible label", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
		render(<CopyButton text="hello" ariaLabel="Copy basic command" />);
		const button = screen.getByRole("button", { name: "Copy basic command" });
		expect(button).toHaveTextContent("Copy");
		await userEvent.click(button);
		expect(
			await screen.findByRole("button", { name: "Copied" }),
		).toBeInTheDocument();
	});

	describe("with load", () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		class FakeClipboardItem {
			constructor(readonly items: Record<string, Promise<Blob>>) {}
		}

		it("writes a ClipboardItem whose blob comes from load", async () => {
			const write = vi.fn(async (items: FakeClipboardItem[]) => {
				// The clipboard waits for the promised blob, as a browser does.
				await items[0]?.items["text/plain"];
			});
			const writeText = vi.fn();
			Object.defineProperty(navigator, "clipboard", {
				value: { write, writeText },
				configurable: true,
			});
			vi.stubGlobal("ClipboardItem", FakeClipboardItem);
			const load = vi.fn().mockResolvedValue("the full file");
			render(<CopyButton load={load} />);
			await userEvent.click(screen.getByRole("button", { name: "Copy" }));
			expect(
				await screen.findByRole("button", { name: "Copied" }),
			).toBeInTheDocument();
			expect(load).toHaveBeenCalledOnce();
			expect(writeText).not.toHaveBeenCalled();
			const item = write.mock.calls[0]?.[0][0];
			const blob = await item?.items["text/plain"];
			expect(blob?.type).toBe("text/plain");
			const read = await new Promise<string>((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result));
				reader.readAsText(blob as Blob);
			});
			expect(read).toBe("the full file");
		});

		it("falls back to load then writeText without ClipboardItem", async () => {
			const writeText = vi.fn().mockResolvedValue(undefined);
			Object.defineProperty(navigator, "clipboard", {
				value: { writeText },
				configurable: true,
			});
			vi.stubGlobal("ClipboardItem", undefined);
			render(<CopyButton load={async () => "fetched"} />);
			await userEvent.click(screen.getByRole("button", { name: "Copy" }));
			expect(
				await screen.findByRole("button", { name: "Copied" }),
			).toBeInTheDocument();
			expect(writeText).toHaveBeenCalledWith("fetched");
		});

		it("a failed load never shows Copied", async () => {
			const write = vi.fn(async (items: FakeClipboardItem[]) => {
				await items[0]?.items["text/plain"];
			});
			const writeText = vi.fn().mockResolvedValue(undefined);
			Object.defineProperty(navigator, "clipboard", {
				value: { write, writeText },
				configurable: true,
			});
			vi.stubGlobal("ClipboardItem", FakeClipboardItem);
			const onCopied = vi.fn();
			render(
				<CopyButton
					load={() => Promise.reject(new Error("offline"))}
					onCopied={onCopied}
				/>,
			);
			await userEvent.click(screen.getByRole("button", { name: "Copy" }));
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(onCopied).not.toHaveBeenCalled();
			expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
			expect(writeText).not.toHaveBeenCalled();

			vi.stubGlobal("ClipboardItem", undefined);
			await userEvent.click(screen.getByRole("button", { name: "Copy" }));
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(onCopied).not.toHaveBeenCalled();
			expect(writeText).not.toHaveBeenCalled();
		});
	});
});
