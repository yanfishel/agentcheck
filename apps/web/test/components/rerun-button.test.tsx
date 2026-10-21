// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	FULL_CHECK_INTENT_KEY,
	FULL_CHECK_INTENT_TTL_MS,
	rememberFullCheck,
	takeFullCheck,
} from "@/components/full-check-intent";
import { RerunButton } from "@/components/rerun-button";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
let signedIn = false;
const openSignIn = vi.fn();
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: signedIn }),
	useClerk: () => ({ openSignIn, openSignUp: vi.fn() }),
}));

const URL_ = "https://example.com/";
let fetchMock: ReturnType<typeof vi.fn>;

const stored = () => {
	const raw = sessionStorage.getItem(FULL_CHECK_INTENT_KEY);
	return raw === null ? null : (JSON.parse(raw) as { auditId: string });
};

function mount() {
	return render(<RerunButton url={URL_} mode="full" upgrade auditId="a1" />);
}

beforeEach(() => {
	sessionStorage.clear();
	signedIn = false;
	fetchMock = vi
		.fn()
		.mockResolvedValue(Response.json({ id: "a2" }, { status: 201 }));
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	push.mockReset();
	openSignIn.mockReset();
});

describe("full-check intent", () => {
	it("is returned once for its audit, kept for another, dropped when stale", () => {
		rememberFullCheck("a1", URL_, 1000);
		expect(takeFullCheck("other", 2000)).toBeNull();
		expect(stored()?.auditId).toBe("a1");
		expect(takeFullCheck("a1", 2000)).toMatchObject({
			auditId: "a1",
			url: URL_,
		});
		expect(stored()).toBeNull();

		rememberFullCheck("a1", URL_, 1000);
		expect(takeFullCheck("a1", 1000 + FULL_CHECK_INTENT_TTL_MS + 1)).toBeNull();
		expect(stored()).toBeNull();
	});

	it("ignores garbage in storage", () => {
		sessionStorage.setItem(FULL_CHECK_INTENT_KEY, "{not json");
		expect(takeFullCheck("a1")).toBeNull();
		sessionStorage.setItem(FULL_CHECK_INTENT_KEY, JSON.stringify({ at: "x" }));
		expect(takeFullCheck("a1")).toBeNull();
		expect(stored()).toBeNull();
	});
});

describe("RerunButton Full check for a guest", () => {
	it("remembers the press and shows the account dialog, without a request", async () => {
		mount();
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		expect(
			await screen.findByRole("dialog", {
				name: "Full check needs an account",
			}),
		).toBeInTheDocument();
		expect(stored()?.auditId).toBe("a1");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("pressing Sign in only opens sign-in; the press itself is what is remembered", async () => {
		mount();
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
		expect(openSignIn).toHaveBeenCalledOnce();
		expect(stored()?.auditId).toBe("a1");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("starts the full check by itself once the viewer is signed in on the page", async () => {
		const view = mount();
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		signedIn = true;
		view.rerender(<RerunButton url={URL_} mode="full" upgrade auditId="a1" />);
		await waitFor(() => expect(push).toHaveBeenCalledWith("/audits/a2"));
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({ url: URL_, mode: "full" });
		expect(stored()).toBeNull();
	});

	it("starts once on mount when a signed-in viewer comes back with the intent", async () => {
		rememberFullCheck("a1", URL_);
		signedIn = true;
		const view = mount();
		await waitFor(() => expect(push).toHaveBeenCalledWith("/audits/a2"));
		view.rerender(<RerunButton url={URL_} mode="full" upgrade auditId="a1" />);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("leaves another audit's intent alone", () => {
		rememberFullCheck("a9", URL_);
		signedIn = true;
		mount();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(stored()?.auditId).toBe("a9");
	});

	it("forgets the press when the dialog is closed without signing in", async () => {
		const view = mount();
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		expect(stored()?.auditId).toBe("a1");
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(stored()).toBeNull();
		signedIn = true;
		view.rerender(<RerunButton url={URL_} mode="full" upgrade auditId="a1" />);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does nothing without an audit id or for a plain Run again", async () => {
		render(<RerunButton url={URL_} mode="full" upgrade />);
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		expect(stored()).toBeNull();
		cleanup();
		rememberFullCheck("a1", URL_);
		signedIn = true;
		render(<RerunButton url={URL_} mode="quick" auditId="a1" />);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(stored()?.auditId).toBe("a1");
	});
});
