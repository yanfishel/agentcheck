// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RerunButton } from "@/components/rerun-button";
import {
	RERUN_INTENT_KEY,
	RERUN_INTENT_TTL_MS,
	rememberRerun,
	takeRerun,
} from "@/components/rerun-intent";

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
	const raw = sessionStorage.getItem(RERUN_INTENT_KEY);
	return raw === null
		? null
		: (JSON.parse(raw) as { auditId: string; mode: string });
};

const full = () => <RerunButton url={URL_} mode="full" upgrade auditId="a1" />;
const quick = () => <RerunButton url={URL_} mode="quick" auditId="a1" />;

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

describe("rerun intent", () => {
	it("is returned once for its audit and mode, kept for others, dropped when stale", () => {
		rememberRerun("a1", URL_, "full", 1000);
		expect(takeRerun("other", "full", 2000)).toBeNull();
		expect(takeRerun("a1", "quick", 2000)).toBeNull();
		expect(stored()?.auditId).toBe("a1");
		expect(takeRerun("a1", "full", 2000)).toMatchObject({
			auditId: "a1",
			url: URL_,
			mode: "full",
		});
		expect(stored()).toBeNull();

		rememberRerun("a1", URL_, "full", 1000);
		expect(takeRerun("a1", "full", 1000 + RERUN_INTENT_TTL_MS + 1)).toBeNull();
		expect(stored()).toBeNull();
	});

	it("ignores garbage in storage", () => {
		sessionStorage.setItem(RERUN_INTENT_KEY, "{not json");
		expect(takeRerun("a1", "full")).toBeNull();
		sessionStorage.setItem(RERUN_INTENT_KEY, JSON.stringify({ at: "x" }));
		expect(takeRerun("a1", "full")).toBeNull();
		expect(stored()).toBeNull();
	});
});

describe("RerunButton Full check for a guest", () => {
	it("remembers the press and shows the account dialog, without a request", async () => {
		render(full());
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		expect(
			await screen.findByRole("dialog", {
				name: "Full check needs an account",
			}),
		).toBeInTheDocument();
		expect(stored()).toMatchObject({ auditId: "a1", mode: "full" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("pressing Sign in only opens sign-in; the press itself is what is remembered", async () => {
		render(full());
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
		expect(openSignIn).toHaveBeenCalledOnce();
		expect(stored()?.auditId).toBe("a1");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("starts the full check by itself once the viewer is signed in on the page", async () => {
		const view = render(full());
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		signedIn = true;
		view.rerender(full());
		await waitFor(() => expect(push).toHaveBeenCalledWith("/audits/a2"));
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({ url: URL_, mode: "full" });
		expect(stored()).toBeNull();
	});

	it("starts once on mount when a signed-in viewer comes back with the intent", async () => {
		rememberRerun("a1", URL_, "full");
		signedIn = true;
		const view = render(full());
		await waitFor(() => expect(push).toHaveBeenCalledWith("/audits/a2"));
		view.rerender(full());
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("leaves another audit's intent alone", () => {
		rememberRerun("a9", URL_, "full");
		signedIn = true;
		render(full());
		expect(fetchMock).not.toHaveBeenCalled();
		expect(stored()?.auditId).toBe("a9");
	});

	it("forgets the press when the dialog is closed without signing in", async () => {
		const view = render(full());
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		expect(stored()?.auditId).toBe("a1");
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(stored()).toBeNull();
		signedIn = true;
		view.rerender(full());
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does nothing without an audit id", async () => {
		render(<RerunButton url={URL_} mode="full" upgrade />);
		await userEvent.click(screen.getByRole("button", { name: "Full check" }));
		expect(stored()).toBeNull();
	});
});

describe("RerunButton Run again carries a remembered quick run", () => {
	it("starts a quick intent (a guest's Generate fix files) and leaves a full one alone", async () => {
		rememberRerun("a1", URL_, "full");
		signedIn = true;
		render(quick());
		expect(fetchMock).not.toHaveBeenCalled();
		expect(stored()?.mode).toBe("full");
		cleanup();

		rememberRerun("a1", URL_, "quick");
		render(quick());
		await waitFor(() => expect(push).toHaveBeenCalledWith("/audits/a2"));
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({ url: URL_, mode: "quick" });
		expect(stored()).toBeNull();
	});
});
