// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu } from "@/components/ui";

// Marks client-router links and stops jsdom's real navigation ("Not implemented: navigation").
vi.mock("next/link", () => ({
	default: ({ href, onClick, ...props }: ComponentProps<"a">) => (
		<a
			{...props}
			href={href}
			data-next-link=""
			onClick={(event) => {
				event.preventDefault();
				onClick?.(event);
			}}
		/>
	),
}));

afterEach(cleanup);

function setup(onSelect = vi.fn()) {
	render(
		<Menu
			label="Account"
			trigger={<button type="button">Open</button>}
			items={[
				{ label: "Sign out", onSelect },
				{ label: "Docs", href: "/docs" },
				{ label: "Report.json", href: "/export?format=json", download: true },
			]}
		/>,
	);
	return onSelect;
}

describe("Menu", () => {
	it("opens on click, lists menuitems and closes on Escape", async () => {
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Open" }));
		expect(await screen.findAllByRole("menuitem")).toHaveLength(3);
		expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
		await userEvent.keyboard("{Escape}");
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("runs onSelect of the chosen item", async () => {
		const onSelect = setup();
		await userEvent.click(screen.getByRole("button", { name: "Open" }));
		await userEvent.click(
			await screen.findByRole("menuitem", { name: "Sign out" }),
		);
		expect(onSelect).toHaveBeenCalledOnce();
	});

	it("renders href items as links", async () => {
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Open" }));
		expect(
			await screen.findByRole("menuitem", { name: "Docs" }),
		).toHaveAttribute("href", "/docs");
	});

	it("closes after choosing a link item", async () => {
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Open" }));
		await userEvent.click(
			await screen.findByRole("menuitem", { name: "Docs" }),
		);
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
	});

	it("renders download items as plain anchors with download, outside the client router", async () => {
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Open" }));
		const item = await screen.findByRole("menuitem", { name: "Report.json" });
		expect(item.tagName).toBe("A");
		expect(item).toHaveAttribute("href", "/export?format=json");
		expect(item).toHaveAttribute("download");
		expect(item).not.toHaveAttribute("data-next-link");
		const docs = screen.getByRole("menuitem", { name: "Docs" });
		expect(docs).toHaveAttribute("data-next-link");
		expect(docs).not.toHaveAttribute("download");
	});
});
