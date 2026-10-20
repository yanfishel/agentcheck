// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartAuditForm } from "@/components/start-audit-form";

const push = vi.fn();
const openSignIn = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
let isSignedIn: boolean | undefined = false;
vi.mock("@clerk/nextjs", () => ({
	useClerk: () => ({ openSignIn, openSignUp: vi.fn() }),
	// Clerk reports isSignedIn as undefined until it has loaded.
	useAuth: () => ({ isLoaded: isSignedIn !== undefined, isSignedIn }),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	push.mockReset();
	openSignIn.mockReset();
	isSignedIn = false;
});

async function submit(button: "Quick" | "Full check") {
	const user = userEvent.setup();
	render(<StartAuditForm />);
	await user.type(
		screen.getByRole("textbox", { name: "Website URL" }),
		"https://example.com",
	);
	await user.click(screen.getByRole("button", { name: button }));
}

function sentBody(call: number) {
	const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
	expect(url).toBe("/api/audits");
	return JSON.parse(String(init.body));
}

describe("StartAuditForm", () => {
	it.each([
		[undefined, [false, false]],
		[false, [true, false]],
		[true, [false, true]],
	])("primary button once Clerk knows (signed in: %s)", (signedIn, primary) => {
		isSignedIn = signedIn;
		render(<StartAuditForm />);
		const isPrimary = (name: string) =>
			screen
				.getByRole("button", { name })
				.className.split(" ")
				.includes("bg-accent");
		expect([isPrimary("Quick"), isPrimary("Full check")]).toEqual(primary);
	});

	it.each([
		[false, "quick"],
		[undefined, "quick"],
		[true, "full"],
	])(
		"Enter starts the default mode (signed in: %s, mode: %s)",
		async (signedIn, mode) => {
			isSignedIn = signedIn;
			fetchMock.mockImplementation(async () =>
				Response.json({ id: "a1" }, { status: 201 }),
			);
			const user = userEvent.setup();
			render(<StartAuditForm />);
			await user.type(
				screen.getByRole("textbox", { name: "Website URL" }),
				"https://example.com{Enter}",
			);
			await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
			expect(sentBody(0).mode).toBe(mode);
		},
	);

	it("gives each mode an icon and hides the label visually only on phones", () => {
		render(<StartAuditForm />);
		for (const name of ["Quick", "Full check"]) {
			const button = screen.getByRole("button", { name });
			expect(button.querySelector("svg[aria-hidden='true']")).not.toBeNull();
			expect(screen.getByText(name)).toHaveClass("sr-only", "sm:not-sr-only");
		}
	});

	it("posts quick or full by the pressed button and navigates on 201", async () => {
		fetchMock.mockImplementation(async () =>
			Response.json({ id: "a1" }, { status: 201 }),
		);
		await submit("Quick");
		await waitFor(() => expect(push).toHaveBeenCalledWith("/audits/a1"));
		expect(sentBody(0)).toEqual({ url: "https://example.com", mode: "quick" });

		cleanup();
		isSignedIn = true;
		await submit("Full check");
		await waitFor(() => expect(push).toHaveBeenCalledTimes(2));
		expect(sentBody(1)).toEqual({ url: "https://example.com", mode: "full" });
	});

	it("shows a 429 message with the wait inside the card", async () => {
		const error = "Too many checks from your network. Try again in 42 minutes.";
		fetchMock.mockResolvedValue(Response.json({ error }, { status: 429 }));
		await submit("Quick");
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(error);
		expect(alert.textContent).toBe(error);
		expect(
			screen.getByRole("form", { name: "Start an audit" }),
		).toContainElement(alert);
		expect(push).not.toHaveBeenCalled();
	});

	it("replaces the browser's validation with its own message for an empty URL", async () => {
		const user = userEvent.setup();
		render(<StartAuditForm />);
		expect(
			screen.getByRole("form", { name: "Start an audit" }),
		).toHaveAttribute("novalidate");
		await user.type(
			screen.getByRole("textbox", { name: "Website URL" }),
			"   ",
		);
		await user.click(screen.getByRole("button", { name: "Quick" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Enter a website address.",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("clears the error as soon as the URL is edited", async () => {
		const user = userEvent.setup();
		render(<StartAuditForm />);
		await user.click(screen.getByRole("button", { name: "Quick" }));
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		await user.type(screen.getByRole("textbox", { name: "Website URL" }), "e");
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("asks a guest to sign up instead of starting a full check", async () => {
		await submit("Full check");
		expect(
			await screen.findByRole("dialog", {
				name: "Full check needs an account",
			}),
		).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(push).not.toHaveBeenCalled();
	});

	it("shows the same dialog on 401", async () => {
		isSignedIn = true;
		fetchMock.mockResolvedValue(
			Response.json({ error: "Sign in required" }, { status: 401 }),
		);
		await submit("Full check");
		expect(
			await screen.findByRole("dialog", {
				name: "Full check needs an account",
			}),
		).toBeInTheDocument();
		expect(screen.queryByRole("alert")).toBeNull();
		expect(push).not.toHaveBeenCalled();
	});
});

describe("StartAuditForm focus", () => {
	const pointer = (fine: boolean) => {
		window.matchMedia = ((query: string) => ({
			matches: fine && query === "(pointer: fine)",
		})) as unknown as typeof window.matchMedia;
	};
	afterEach(() => {
		Reflect.deleteProperty(window, "matchMedia");
	});

	it("puts the cursor in the field on load where there is a mouse", () => {
		pointer(true);
		render(<StartAuditForm />);
		expect(document.activeElement).toBe(screen.getByLabelText("Website URL"));
	});

	it("leaves a touch screen alone on load, so no keyboard pops up", () => {
		pointer(false);
		render(<StartAuditForm />);
		expect(document.activeElement).not.toBe(
			screen.getByLabelText("Website URL"),
		);
	});

	it("focuses the field when a link to #start is clicked", async () => {
		pointer(false);
		render(
			<>
				<a href="#start">Run this check on your site</a>
				<StartAuditForm />
			</>,
		);
		await userEvent.click(screen.getByText("Run this check on your site"));
		expect(document.activeElement).toBe(screen.getByLabelText("Website URL"));
	});
});

describe("StartAuditForm on the closing band", () => {
	afterEach(() => {
		Reflect.deleteProperty(window, "matchMedia");
	});

	it("has its own ids, so it can sit on the page with the hero's form", () => {
		render(
			<>
				<StartAuditForm />
				<StartAuditForm id="check-now" tone="band" />
			</>,
		);
		const forms = document.querySelectorAll("form");
		expect([...forms].map((f) => f.id)).toEqual(["start", "check-now"]);
		const inputs = screen.getAllByLabelText("Website URL");
		expect(new Set(inputs.map((i) => i.id)).size).toBe(2);
	});

	it("never takes focus on load, even with a mouse", () => {
		window.matchMedia = (() => ({
			matches: true,
		})) as unknown as typeof window.matchMedia;
		render(<StartAuditForm id="check-now" tone="band" />);
		expect(document.activeElement).toBe(document.body);
	});

	it("draws its hint in the band's text colour", () => {
		render(<StartAuditForm id="check-now" tone="band" />);
		expect(
			screen.getByText(/Quick runs without a browser/).className,
		).toContain("text-accent-fg");
	});
});
