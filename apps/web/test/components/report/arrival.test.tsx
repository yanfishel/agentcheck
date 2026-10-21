// @vitest-environment jsdom
import type { AuditResult } from "@agentcheck/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditReport, type PartialAuditView } from "@/components/audit-report";
import { FixFilesPanel } from "@/components/report/fix-files/panel";
import { FixFilesProvider } from "@/components/report/fix-files/provider";
import type { FixFilesView } from "@/server/fix-files";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
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
const actions = category("agentic-actionability", "Agentic Actionability", 70);

const TARGET = "https://example.com";

function partial(...categories: CategoryResult[]): PartialAuditView {
	return { target: TARGET, categories };
}

const done: AuditResult = {
	tool: { name: "agentcheck", version: "0.1.0" },
	target: TARGET,
	finalUrl: TARGET,
	timestamp: "2026-10-21T10:00:00.000Z",
	score: 85,
	grade: "B",
	browser: { used: false, reason: "No browser" },
	categories: [manifests, bots, semantics, actions],
};

const none: FixFilesView = {
	status: "none",
	kinds: ["robots"],
	attempts: 0,
	progress: null,
	error: null,
	result: null,
	hasPrompt: false,
};

let reducedMotion = false;

beforeEach(() => {
	reducedMotion = false;
	window.matchMedia = ((query: string) => ({
		matches: query.includes("prefers-reduced-motion") && reducedMotion,
		media: query,
		addEventListener() {},
		removeEventListener() {},
	})) as unknown as typeof window.matchMedia;
	vi.useFakeTimers({
		toFake: [
			"setTimeout",
			"clearTimeout",
			"requestAnimationFrame",
			"cancelAnimationFrame",
			"performance",
			"Date",
		],
	});
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	Reflect.deleteProperty(window, "matchMedia");
});

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

function sectionTitles(): string[] {
	return Array.from(document.querySelectorAll('[id^="category-"]')).map(
		(element) => element.id,
	);
}

/** The section rows waiting for their category. */
function waitingRows(): HTMLElement[] {
	return Array.from(document.querySelectorAll('section[aria-busy="true"]'));
}

/** One slot per category in the sections list, in order. */
function slots(): HTMLElement[] {
	const first = document.querySelector("section")?.parentElement;
	return Array.from(first?.parentElement?.children ?? []) as HTMLElement[];
}

function expanded(title: string): string | null {
	return screen
		.getByRole("button", { name: new RegExp(title) })
		.getAttribute("aria-expanded");
}

function arrivals(): Element[] {
	return Array.from(document.querySelectorAll('[class*="animate-arrive-"]'));
}

function report(
	result: AuditResult | PartialAuditView,
	animate: boolean,
): ReactElement {
	return (
		<AuditReport
			result={result}
			animate={animate}
			actions={<button type="button">Run again</button>}
			categoryFooter={(id) => <p>{`FOOTER-${id}`}</p>}
			categoryAside={(summary) => <p>{`ASIDE-${summary.id}`}</p>}
		/>
	);
}

async function advance(ms: number) {
	await act(async () => {
		vi.advanceTimersByTime(ms);
	});
}

describe("partial report", () => {
	it("renders placeholder tiles for categories not yet in", () => {
		render(report(partial(manifests), true));
		const tiles = screen
			.getByRole("navigation", { name: "Categories" })
			.querySelectorAll("a");
		expect(tiles).toHaveLength(4);
		expect(screen.getByRole("link", { name: /AI Manifests/ })).toBeTruthy();
		expect(screen.queryByRole("link", { name: /Bot Access/ })).toBeNull();
		expect(tile("Bot Access").innerHTML).toContain("animate-pulse");
		expect(tile("AI Manifests").innerHTML).not.toContain("animate-pulse");
	});

	it("renders waiting rows for categories not yet in", () => {
		render(report(partial(semantics, manifests), true));
		expect(sectionTitles()).toEqual([
			"category-ai-manifests",
			"category-content-semantics",
		]);
		expect(screen.getByText("Content & Semantics message")).toBeTruthy();
		// Every category has its row, in category order; the missing ones wait.
		expect(slots().map((slot) => slot.textContent)).toEqual([
			expect.stringContaining("AI Manifests"),
			"Bot Access",
			expect.stringContaining("Content & Semantics"),
			"Agentic Actionability",
		]);
		const rows = waitingRows();
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.querySelector("button")).toBeNull();
			expect(row.innerHTML).toContain("animate-pulse");
		}
		// The actions are in place; asides and footers wait for the finished report.
		expect(screen.getByText("Run again")).toBeTruthy();
		expect(document.body.textContent).not.toContain("FOOTER-");
		expect(document.body.textContent).not.toContain("ASIDE-");
	});

	it("a waiting row becomes the section in the same slot", () => {
		const view = render(report(partial(manifests), true));
		const slot = waitingRows()[0]?.parentElement;
		expect(slot?.textContent).toBe("Bot Access");

		view.rerender(report(partial(manifests, bots), true));
		const section = document.getElementById("category-bot-access");
		expect(section?.closest("section")?.parentElement).toBe(slot);
		expect(slot?.querySelector('[aria-busy="true"]')).toBeNull();
		expect(waitingRows()).toHaveLength(2);
	});

	it("animates a tile that fills while animate is on", async () => {
		const view = render(report(partial(), true));
		const placeholder = tile("AI Manifests");
		expect(arrivals()).toHaveLength(0);

		view.rerender(report(partial(manifests), true));
		const filled = tile("AI Manifests");
		// The same element turns from placeholder to filled: no remount.
		expect(filled).toBe(placeholder);
		expect(filled.className).toContain("animate-arrive-pop");
		expect(filled.textContent).not.toContain("80");
		// Its section rises in with it.
		const section = document.getElementById("category-ai-manifests");
		expect(section?.closest('[class*="animate-arrive-rise"]')).toBeTruthy();

		await advance(800);
		expect(tile("AI Manifests").textContent).toContain("80");

		// The finished report keeps the tile and does not replay it.
		view.rerender(report(done, true));
		expect(tile("AI Manifests")).toBe(placeholder);
		expect(screen.getByText("Run again")).toBeTruthy();
	});

	it("renders a done report without arrival animations", () => {
		render(report(done, false));
		expect(arrivals()).toHaveLength(0);
		expect(tile("AI Manifests").textContent).toContain("80");
		expect(screen.getByText("Run again")).toBeTruthy();
		expect(document.body.textContent).toContain("FOOTER-ai-manifests");
	});

	it("does not animate pieces that arrive while animate is off", () => {
		const view = render(report(partial(), false));
		view.rerender(report(partial(manifests), false));
		expect(arrivals()).toHaveLength(0);
		expect(tile("AI Manifests").textContent).toContain("80");
	});

	it("does not animate the pieces of the first render", () => {
		render(report(partial(manifests), true));
		expect(arrivals()).toHaveLength(0);
		expect(tile("AI Manifests").textContent).toContain("80");
	});

	it("no animation with reduced motion", () => {
		reducedMotion = true;
		const view = render(report(partial(), true));
		view.rerender(report(partial(manifests), true));
		expect(arrivals()).toHaveLength(0);
		expect(tile("AI Manifests").textContent).toContain("80");
	});

	it("opens an arriving section with problems, leaves a clean one closed", async () => {
		const view = render(report(partial(), true));
		view.rerender(report(partial(manifests, bots), true));
		// Mounted closed, then opened by the accordion, so its height animates.
		expect(expanded("AI Manifests")).toBe("false");
		await advance(100);
		expect(expanded("AI Manifests")).toBe("true");
		expect(expanded("Bot Access")).toBe("false");

		// The finished report leaves them as they are.
		view.rerender(report(done, true));
		await advance(100);
		expect(expanded("AI Manifests")).toBe("true");
		expect(expanded("Bot Access")).toBe("false");
	});

	it("a reopened report opens problem sections without animation", () => {
		render(report(done, false));
		expect(expanded("AI Manifests")).toBe("true");
		expect(expanded("Bot Access")).toBe("false");
	});

	it("a reload mid-run opens the problem sections already in at once", () => {
		render(report(partial(manifests, bots), true));
		expect(expanded("AI Manifests")).toBe("true");
		expect(expanded("Bot Access")).toBe("false");
	});

	it("with reduced motion an arriving section with problems opens at once", () => {
		reducedMotion = true;
		const view = render(report(partial(), true));
		view.rerender(report(partial(manifests), true));
		expect(expanded("AI Manifests")).toBe("true");
	});
});

describe("Fix files while the check runs", () => {
	const OWNER = "owner";
	function fixFiles(
		kinds: FixFilesView["kinds"],
		pending: boolean,
		result: AuditResult | PartialAuditView = partial(bots),
		kindsSettled = false,
	): ReactElement {
		return (
			<FixFilesProvider
				auditId="a1"
				url={TARGET}
				mode="quick"
				role={OWNER}
				initial={{ ...none, kinds }}
				pending={pending}
				kindsSettled={kindsSettled}
			>
				<AuditReport result={result} animate fixFiles={<FixFilesPanel />} />
			</FixFilesProvider>
		);
	}

	it("Fix files waits while pending", () => {
		const view = render(fixFiles(["robots"], true));
		const button = () =>
			screen.getByRole("button", {
				name: "Generate fix files",
			}) as HTMLButtonElement;
		const panel = () => screen.getByRole("region", { name: "Fix files" });
		expect(button().disabled).toBe(true);
		expect(panel().textContent).toContain(
			"robots.txt built from your site's own pages. Available when the check finishes.",
		);

		// The list of files follows the categories as they arrive.
		view.rerender(fixFiles(["robots", "head"], true));
		expect(panel().textContent).toContain(
			"robots.txt and head tags built from your site's own pages. Available when the check finishes.",
		);

		view.rerender(fixFiles(["robots", "head"], false, done));
		expect(button().disabled).toBe(false);
		expect(panel().textContent).not.toContain("Available when");
		expect(panel().textContent).toContain(
			"robots.txt and head tags built from your site's own pages.",
		);
	});

	const panel = () => screen.queryByRole("region", { name: "Fix files" });

	it("Fix files waits, then shows its files", () => {
		const view = render(fixFiles([], true, partial()));
		// Waiting from the start: a pulsing line in place of the text, Generate off.
		expect(panel()?.getAttribute("aria-busy")).toBe("true");
		expect(panel()?.innerHTML).toContain("animate-pulse");
		expect(panel()?.textContent).not.toContain("built from");
		expect(
			(
				screen.getByRole("button", {
					name: "Generate fix files",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);

		view.rerender(fixFiles(["robots"], true));
		expect(panel()?.getAttribute("aria-busy")).toBeNull();
		expect(panel()?.innerHTML).not.toContain("animate-pulse");
		expect(panel()?.textContent).toContain(
			"robots.txt built from your site's own pages. Available when the check finishes.",
		);
	});

	it("Fix files collapses when settled with nothing to fix", async () => {
		const view = render(fixFiles([], true, partial()));
		view.rerender(fixFiles([], true, partial(manifests), true));
		// Height and opacity go to zero first, then the block is gone.
		expect(panel()).not.toBeNull();
		expect(panel()?.closest('[class*="grid-rows-[0fr]"]')).not.toBeNull();
		await advance(600);
		expect(panel()).toBeNull();

		// It stays gone, also when the audit finishes.
		view.rerender(fixFiles([], false, done));
		expect(panel()).toBeNull();
	});

	it("collapses at once with reduced motion", () => {
		reducedMotion = true;
		const view = render(fixFiles([], true, partial()));
		expect(panel()).not.toBeNull();
		view.rerender(fixFiles([], true, partial(manifests), true));
		expect(panel()).toBeNull();
	});

	it("a reload after the kinds settled empty shows no block", () => {
		render(fixFiles([], true, partial(manifests), true));
		expect(panel()).toBeNull();
	});

	it("no Fix files block on a done report without kinds", () => {
		render(fixFiles([], false, done));
		expect(panel()).toBeNull();
	});
});
