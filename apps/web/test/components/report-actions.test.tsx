// @vitest-environment jsdom
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportActions } from "@/components/report-actions";
import { ToastProvider } from "@/components/ui";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
let signedIn = true;
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: signedIn }),
	useClerk: () => ({ openSignIn: vi.fn(), openSignUp: vi.fn() }),
}));

const SHARE_URL = "https://agentcheck.dev/r/tok123";
const BADGE_URL = "https://agentcheck.dev/api/shared/tok123/badge.svg";

type Props = ComponentProps<typeof ReportActions>;

const base: Props = {
	auditId: "a1",
	mode: "quick",
	url: "https://example.com",
	score: 78,
	canRerun: true,
	canShare: true,
	shareToken: null,
	shareUrl: null,
	exportBase: "/api/audits/a1/export",
	badgeUrl: null,
};

function setup(props: Partial<Props> = {}) {
	render(
		<ToastProvider>
			<ReportActions {...base} {...props} />
		</ToastProvider>,
	);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText: vi.fn().mockResolvedValue(undefined) },
		configurable: true,
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	push.mockReset();
	signedIn = true;
});

describe("ReportActions", () => {
	it("creates a share link in the Share dialog and stops sharing", async () => {
		fetchMock.mockResolvedValueOnce(
			Response.json({ shareToken: "tok123", url: SHARE_URL }),
		);
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Share" }));
		const offer = await screen.findByRole("dialog", {
			name: "Make this report public?",
		});
		expect(offer).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Create link" }));
		expect(fetchMock).toHaveBeenCalledWith("/api/audits/a1/share", {
			method: "POST",
		});
		const dialog = await screen.findByRole("dialog", {
			name: "Share this report",
		});
		expect(await screen.findAllByDisplayValue(SHARE_URL)).not.toHaveLength(0);
		expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
		const places = within(dialog).getByRole("list", { name: "Share on" });
		expect(
			within(places)
				.getAllByRole("link")
				.map((a) => a.textContent),
		).toEqual([
			"X",
			"LinkedIn",
			"Facebook",
			"Reddit",
			"Hacker News",
			"Bluesky",
			"Email",
		]);
		expect(
			within(places).getByRole("link", { name: "LinkedIn" }),
		).toHaveAttribute(
			"href",
			`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}`,
		);

		fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
		await userEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
		expect(fetchMock).toHaveBeenLastCalledWith("/api/audits/a1/share", {
			method: "DELETE",
		});
		expect(
			await screen.findByRole("button", { name: "Create link" }),
		).toBeInTheDocument();
		expect(screen.queryAllByDisplayValue(SHARE_URL)).toHaveLength(0);
	});

	it("shows the old error text when the share request fails", async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Share" }));
		await userEvent.click(
			await screen.findByRole("button", { name: "Create link" }),
		);
		expect(
			await screen.findByText("Could not create the link"),
		).toBeInTheDocument();
	});

	it("shows the generic failure when a 2xx reply has a malformed body", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response("<html>oops</html>", { status: 200 }),
		);
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Share" }));
		await userEvent.click(
			await screen.findByRole("button", { name: "Create link" }),
		);
		expect(
			await screen.findByText("Could not create the link"),
		).toBeInTheDocument();
		expect(screen.queryByText(/SyntaxError|JSON/)).toBeNull();
	});

	it("clears the error when the Share dialog closes", async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Share" }));
		await userEvent.click(
			await screen.findByRole("button", { name: "Create link" }),
		);
		expect(
			await screen.findByText("Could not create the link"),
		).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await userEvent.click(screen.getByRole("button", { name: "Share" }));
		await screen.findByRole("dialog", { name: "Make this report public?" });
		expect(screen.queryByText("Could not create the link")).toBeNull();
	});

	it("lists JSON and HTML in the Export menu", async () => {
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Export" }));
		expect(
			await screen.findByRole("menuitem", { name: "JSON" }),
		).toHaveAttribute("href", "/api/audits/a1/export?format=json");
		expect(screen.getByRole("menuitem", { name: "HTML" })).toHaveAttribute(
			"href",
			"/api/audits/a1/export?format=html",
		);
		for (const name of ["JSON", "HTML"]) {
			expect(screen.getByRole("menuitem", { name })).toHaveAttribute(
				"download",
			);
		}
	});

	it("asks the owner to share first when there is no badge yet", async () => {
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Get badge" }));
		expect(
			await screen.findByText("Share the report to publish its badge"),
		).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Share" }));
		expect(
			await screen.findByRole("dialog", { name: "Make this report public?" }),
		).toBeInTheDocument();
	});

	it("shows the Markdown badge snippet with a Copy button", async () => {
		setup({ shareToken: "tok123", shareUrl: SHARE_URL, badgeUrl: BADGE_URL });
		await userEvent.click(screen.getByRole("button", { name: "Get badge" }));
		const markdown = `[![AI Ready: 78/100](${BADGE_URL})](${SHARE_URL})`;
		// The snippet is split into coloured spans; match the whole code block.
		expect(
			await screen.findByText(
				(_, element) =>
					element?.tagName === "CODE" && element.textContent === markdown,
			),
		).toBeInTheDocument();
		await userEvent.click(
			screen.getByRole("button", { name: "Copy Markdown" }),
		);
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(markdown);
		expect(
			await screen.findByRole("button", { name: "Copied" }),
		).toBeInTheDocument();
	});

	it("sends a guest's badge request to the sign-in prompt", async () => {
		signedIn = false;
		setup({ canShare: false });
		await userEvent.click(screen.getByRole("button", { name: "Get badge" }));
		const badge = await screen.findByRole("dialog", { name: "Get badge" });
		await userEvent.click(within(badge).getByRole("button", { name: "Share" }));
		expect(
			await screen.findByRole("dialog", { name: "Sharing needs an account" }),
		).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("always shows Share; a guest is asked to sign in", async () => {
		signedIn = false;
		setup({ canShare: false });
		await userEvent.click(screen.getByRole("button", { name: "Share" }));
		expect(
			await screen.findByRole("dialog", { name: "Sharing needs an account" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Sign up" })).toBeVisible();
	});

	it("tells a signed-in non-owner to run it from their account", async () => {
		setup({ canShare: false });
		await userEvent.click(screen.getByRole("button", { name: "Share" }));
		const dialog = await screen.findByRole("dialog", {
			name: "Share it from your account",
		});
		expect(
			within(dialog).getByRole("button", { name: "Run again" }),
		).toBeVisible();
	});

	it("posts the same url and mode on Run again", async () => {
		fetchMock.mockResolvedValueOnce(
			Response.json({ id: "a2" }, { status: 201 }),
		);
		setup();
		await userEvent.click(screen.getByRole("button", { name: "Run again" }));
		expect(fetchMock).toHaveBeenCalledWith("/api/audits", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url: "https://example.com", mode: "quick" }),
		});
		await waitFor(() => expect(push).toHaveBeenCalledWith("/audits/a2"));
	});

	it("offers Full check only after a quick check", () => {
		setup({ mode: "full" });
		expect(screen.queryByRole("button", { name: "Full check" })).toBeNull();
		cleanup();
		setup({ mode: "quick" });
		expect(screen.getByRole("button", { name: "Full check" })).toBeVisible();
	});

	it("asks a guest to sign up instead of starting a full check", async () => {
		signedIn = false;
		setup({ mode: "quick" });
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		expect(
			await screen.findByRole("dialog", {
				name: "Full check needs an account",
			}),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Sign up" })).toBeVisible();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("starts a full check for a signed-in user", async () => {
		fetchMock.mockResolvedValueOnce(
			Response.json({ id: "a2" }, { status: 201 }),
		);
		setup({ mode: "quick" });
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		await waitFor(() => expect(push).toHaveBeenCalledWith("/audits/a2"));
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({
			url: "https://example.com",
			mode: "full",
		});
	});
});
