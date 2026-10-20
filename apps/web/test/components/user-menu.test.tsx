// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserMenu } from "@/components/user-menu";

const openUserProfile = vi.fn();
const signOut = vi.fn();
let user: unknown = {
	fullName: "Ada Lovelace",
	username: null,
	imageUrl: "https://img.example/ada.png",
	primaryEmailAddress: { emailAddress: "ada@example.com" },
};
vi.mock("@clerk/nextjs", () => ({
	useUser: () => ({ user }),
	useClerk: () => ({ openUserProfile, signOut }),
}));

afterEach(() => {
	cleanup();
	openUserProfile.mockReset();
	signOut.mockReset();
});

async function open() {
	await userEvent.click(screen.getByRole("button", { name: "Account" }));
	return screen.findByRole("menu", { name: "Account" });
}

describe("UserMenu", () => {
	it("shows the avatar and, when opened, the name and email", async () => {
		render(<UserMenu className="" />);
		const trigger = screen.getByRole("button", { name: "Account" });
		expect(trigger.querySelector("img")).toHaveAttribute(
			"src",
			"https://img.example/ada.png",
		);
		const menu = await open();
		expect(menu).toHaveTextContent("Ada Lovelace");
		expect(menu).toHaveTextContent("ada@example.com");
		expect(
			screen.getAllByRole("menuitem").map((item) => item.textContent),
		).toEqual(["Manage account", "Sign out"]);
	});

	it("opens the Clerk profile from Manage account", async () => {
		render(<UserMenu className="" />);
		await open();
		await userEvent.click(
			screen.getByRole("menuitem", { name: "Manage account" }),
		);
		expect(openUserProfile).toHaveBeenCalledOnce();
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
	});

	it("signs out back to the landing", async () => {
		render(<UserMenu className="" />);
		await open();
		await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
		expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
	});

	it("greets a user without a name and still shows the email", async () => {
		const saved = user;
		user = {
			fullName: null,
			username: null,
			imageUrl: "https://img.example/x.png",
			primaryEmailAddress: {
				emailAddress: "agentcheck-test+clerk_test@example.com",
			},
		};
		render(<UserMenu className="" />);
		const menu = await open();
		expect(menu).toHaveTextContent("Hi there!");
		const email = screen.getByText("agentcheck-test+clerk_test@example.com");
		expect(email).toHaveClass("truncate");
		expect(email).toHaveAttribute(
			"title",
			"agentcheck-test+clerk_test@example.com",
		);
		user = saved;
	});

	it("keeps the slot while the user is loading", () => {
		user = null;
		render(<UserMenu className="" />);
		expect(screen.queryByRole("button")).toBeNull();
		expect(document.querySelector("[aria-hidden='true']")).not.toBeNull();
	});
});
