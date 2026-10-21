// @vitest-environment jsdom
import type { AuditResult } from "@agentcheck/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveReport, QUEUE_STALL_MS } from "@/components/live-report";
import type { FixFilesView } from "@/server/fix-files";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
	useClerk: () => ({ openSignIn: vi.fn(), openSignUp: vi.fn() }),
}));

type CategoryResult = AuditResult["categories"][number];

function category(
	id: string,
	title: string,
	score: number,
	status: "pass" | "warn" | "fail" = "pass",
): CategoryResult {
	return {
		id,
		title,
		weight: 25,
		status: "scored",
		score,
		checks: [
			{
				id: `${id}-check`,
				title: `${title} check`,
				weight: 1,
				status,
				message: `${title} message`,
			},
		],
	} as CategoryResult;
}

const manifests = category("ai-manifests", "AI Manifests", 80, "warn");
const bots = category("bot-access", "Bot Access", 100);
const semantics = category("content-semantics", "Content & Semantics", 92);
const actionability = category(
	"agentic-actionability",
	"Agentic Actionability",
	70,
);

const URL_ = "https://example.com/";

const result: AuditResult = {
	tool: { name: "agentcheck", version: "0.1.0" },
	target: URL_,
	finalUrl: URL_,
	timestamp: "2026-10-21T10:00:00.000Z",
	score: 85,
	grade: "B",
	browser: { used: false, reason: "No browser" },
	categories: [manifests, bots, semantics, actionability],
};

const none: FixFilesView = {
	status: "none",
	kinds: [],
	attempts: 0,
	progress: null,
	error: null,
	result: null,
	hasPrompt: false,
};

type Body = {
	status: string;
	progress: {
		categories: CategoryResult[];
		hasFavicon: boolean;
		fixKinds: FixFilesView["kinds"];
	} | null;
};

let body: Body = { status: "queued", progress: null };

beforeEach(() => {
	vi.useFakeTimers();
	router.refresh.mockReset();
	body = { status: "queued", progress: null };
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener() {},
		removeEventListener() {},
	})) as unknown as typeof window.matchMedia;
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json(body)),
	);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	Reflect.deleteProperty(window, "matchMedia");
});

const STALLED = /waiting in the queue longer than usual/i;

type Props = ComponentProps<typeof LiveReport>;

function live(props: Partial<Props> = {}): ReactElement {
	return (
		<LiveReport
			id="a1"
			status="queued"
			url={URL_}
			mode="quick"
			queuedMs={0}
			fixFiles={{ role: "owner", initial: none }}
			{...props}
		/>
	);
}

function finished(kinds: FixFilesView["kinds"] = []): Partial<Props> {
	return {
		status: "done",
		final: {
			result,
			actions: <button type="button">Run again</button>,
			now: Date.parse(result.timestamp),
		},
		fixFiles: { role: "owner", initial: { ...none, kinds } },
	};
}

async function advance(ms: number) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

/** The tile of a category: the element that holds its title in the tiles. */
function tile(title: string): HTMLElement {
	const nav = screen.getByRole("navigation", { name: "Categories" });
	const label = Array.from(nav.querySelectorAll("span")).find(
		(span) => span.textContent === title,
	);
	const element = label?.closest("a");
	if (!element) throw new Error(`no tile for ${title}`);
	return element;
}

function arrivals(): Element[] {
	return Array.from(document.querySelectorAll('[class*="animate-arrive-"]'));
}

function urlLine(): HTMLElement {
	const line = screen.getByText(URL_, { selector: "span, a" }).closest("p");
	if (!line) throw new Error("no URL line");
	return line;
}

describe("LiveReport while the audit runs", () => {
	it("fills tiles from polled progress", async () => {
		render(live({ status: "running" }));
		expect(screen.queryByRole("link", { name: /AI Manifests/ })).toBeNull();

		body = {
			status: "running",
			progress: { categories: [manifests], hasFavicon: false, fixKinds: [] },
		};
		await advance(1_000);
		expect(tile("AI Manifests").className).toContain("animate-arrive-pop");
		expect(document.getElementById("category-ai-manifests")).not.toBeNull();
		await advance(1_000);
		expect(tile("AI Manifests").textContent).toContain("80");
		expect(fetch).toHaveBeenCalledWith("/api/audits/a1", expect.anything());
	});

	it("starts filled in from the server's progress, without animation", () => {
		render(
			live({
				status: "running",
				initialProgress: {
					categories: [manifests],
					hasFavicon: false,
					fixKinds: [],
				},
			}),
		);
		expect(tile("AI Manifests").textContent).toContain("80");
		expect(tile("AI Manifests").className).not.toContain("animate-arrive-pop");
	});

	it("shows the favicon once the status says so", async () => {
		render(live({ status: "running" }));
		expect(urlLine().querySelector("img")).toBeNull();

		body = {
			status: "running",
			progress: { categories: [], hasFavicon: true, fixKinds: [] },
		};
		await advance(1_000);
		const img = urlLine().querySelector("img");
		expect(img?.getAttribute("src")).toBe("/api/audits/a1/favicon");
		expect(img?.closest('[class*="animate-arrive-pop"]')).not.toBeNull();
	});

	it("lists the fix files as they are called for, Generate waits", async () => {
		render(live({ status: "running" }));
		body = {
			status: "running",
			progress: {
				categories: [bots],
				hasFavicon: false,
				fixKinds: ["robots"],
			},
		};
		await advance(1_000);
		const panel = screen.getByRole("region", { name: "Fix files" });
		expect(panel.textContent).toContain("Available when the check finishes.");
		const button = screen.getByRole("button", {
			name: "Generate fix files",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});

	it("refreshes when the audit finishes", async () => {
		render(live({ status: "running" }));
		body = { status: "done", progress: null };
		await advance(1_000);
		expect(router.refresh).toHaveBeenCalledTimes(1);
		const calls = vi.mocked(fetch).mock.calls.length;
		await advance(5_000);
		expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
	});

	it("refreshes when the audit fails", async () => {
		render(live({ status: "running" }));
		body = { status: "failed", progress: null };
		await advance(1_000);
		expect(router.refresh).toHaveBeenCalledTimes(1);
	});
});

describe("LiveReport when the audit finishes", () => {
	it("keeps the running tiles mounted when the audit finishes", async () => {
		const view = render(live({ status: "running" }));
		body = {
			status: "running",
			progress: { categories: [manifests], hasFavicon: false, fixKinds: [] },
		};
		await advance(1_000);
		const running = tile("AI Manifests");
		const classes = running.className;
		const section = document.getElementById("category-ai-manifests");

		view.rerender(live(finished()));
		expect(tile("AI Manifests")).toBe(running);
		expect(tile("AI Manifests").className).toBe(classes);
		expect(document.getElementById("category-ai-manifests")).toBe(section);

		// The rest arrives animated: the remaining tiles, the action row, the ring.
		expect(tile("Bot Access").className).toContain("animate-arrive-pop");
		expect(
			screen.getByText("Run again").closest('[class*="animate-arrive-rise"]'),
		).not.toBeNull();
		const ring = screen.getByText("of 100").closest('[class*="arrive-pop"]');
		expect(ring).not.toBeNull();
		await advance(1_000);
		expect(ring?.textContent).toContain("85");
	});

	it("adopts the finished audit's fix files and turns Generate on", async () => {
		const view = render(live({ status: "running" }));
		body = {
			status: "running",
			progress: {
				categories: [bots],
				hasFavicon: false,
				fixKinds: ["robots"],
			},
		};
		await advance(1_000);
		view.rerender(live(finished(["robots", "head"])));
		const panel = screen.getByRole("region", { name: "Fix files" });
		expect(panel.textContent).not.toContain("Available when");
		expect(panel.textContent).toContain("robots.txt and head tags");
		const button = screen.getByRole("button", {
			name: "Generate fix files",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(false);
	});

	it("a page opened on a done audit does not animate", async () => {
		render(live(finished(["robots"])));
		expect(arrivals()).toHaveLength(0);
		expect(tile("AI Manifests").textContent).toContain("80");
		expect(screen.getByText("of 100").parentElement?.textContent).toContain(
			"85",
		);
		await advance(5_000);
		expect(arrivals()).toHaveLength(0);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("LiveReport queue notice", () => {
	it("stays quiet while a fresh audit waits", async () => {
		render(live());
		await advance(QUEUE_STALL_MS - 2_000);
		expect(screen.queryByText(STALLED)).toBeNull();
	});

	it("explains a long wait once the audit has been queued too long", async () => {
		render(live());
		await advance(QUEUE_STALL_MS + 2_000);
		expect(screen.getByText(STALLED)).toBeInTheDocument();
	});

	it("counts the time the audit spent queued before the page opened", () => {
		render(live({ queuedMs: QUEUE_STALL_MS + 1 }));
		expect(screen.getByText(STALLED)).toBeInTheDocument();
	});

	it("drops the notice once the audit starts running", async () => {
		render(live({ queuedMs: QUEUE_STALL_MS + 1 }));
		body = { status: "running", progress: null };
		await advance(2_000);
		expect(screen.queryByText(STALLED)).toBeNull();
	});

	it("never shows it for a running audit", () => {
		render(live({ status: "running", queuedMs: QUEUE_STALL_MS * 10 }));
		expect(screen.queryByText(STALLED)).toBeNull();
	});

	it("asks for a reload after polling gives up", async () => {
		render(live({ status: "running" }));
		await advance(5 * 60_000 + 2_000);
		expect(
			screen.getByText(/taking longer than expected/i),
		).toBeInTheDocument();
	});

	it("says so when the audit is gone", async () => {
		vi.mocked(fetch).mockImplementation(
			async () => new Response(null, { status: 404 }),
		);
		render(live({ status: "running" }));
		await advance(1_000);
		expect(
			screen.getByRole("heading", {
				name: "This audit is no longer available",
			}),
		).toBeInTheDocument();
	});
});

describe("LiveReport layout while waiting", () => {
	it("shows the host as the heading and the status inside the ring", async () => {
		render(live());
		expect(
			screen.getByRole("heading", { level: 1, name: "example.com" }),
		).toBeInTheDocument();
		expect(screen.getByText("Queued")).toBeInTheDocument();
		body = { status: "running", progress: null };
		await advance(1_000);
		expect(screen.getByText("Running")).toBeInTheDocument();
	});

	it("shows the globe on the band's URL line", () => {
		render(live());
		expect(urlLine().querySelector("img")).toBeNull();
		expect(urlLine().querySelector('svg[aria-hidden="true"]')).not.toBeNull();
	});

	it("draws a placeholder tile for every category, in the report order", () => {
		render(live());
		const nav = screen.getByRole("navigation", { name: "Categories" });
		expect(Array.from(nav.children, (child) => child.textContent)).toEqual([
			"AI Manifests",
			"Bot Access",
			"Content & Semantics",
			"Agentic Actionability",
		]);
	});
});
