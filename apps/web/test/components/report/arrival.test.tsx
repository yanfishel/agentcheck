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

	it("renders sections only for present categories, in category order", () => {
		render(report(partial(semantics, manifests), true));
		expect(sectionTitles()).toEqual([
			"category-ai-manifests",
			"category-content-semantics",
		]);
		expect(screen.getByText("Content & Semantics message")).toBeTruthy();
		// No actions, asides or footers until the report is done.
		expect(screen.queryByText("Run again")).toBeNull();
		expect(document.body.textContent).not.toContain("FOOTER-");
		expect(document.body.textContent).not.toContain("ASIDE-");
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
		expect(
			screen.getByText("Run again").closest('[class*="animate-arrive-rise"]'),
		).toBeTruthy();
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

	it("opens a section with problems when the report is done", () => {
		const view = render(report(partial(manifests), true));
		const trigger = () =>
			screen.getByRole("button", { name: /AI Manifests/ }) as HTMLElement;
		expect(trigger().getAttribute("aria-expanded")).toBe("false");
		view.rerender(report(done, true));
		expect(trigger().getAttribute("aria-expanded")).toBe("true");
	});
});

describe("Fix files while the check runs", () => {
	const OWNER = "owner";
	function fixFiles(
		kinds: FixFilesView["kinds"],
		pending: boolean,
		result: AuditResult | PartialAuditView = partial(bots),
	): ReactElement {
		return (
			<FixFilesProvider
				auditId="a1"
				url={TARGET}
				mode="quick"
				role={OWNER}
				initial={{ ...none, kinds }}
				pending={pending}
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

	it("the block rises in when the first file is called for", () => {
		const view = render(fixFiles([], true, partial()));
		expect(screen.queryByRole("region", { name: "Fix files" })).toBeNull();
		view.rerender(fixFiles(["robots"], true));
		const panel = screen.getByRole("region", { name: "Fix files" });
		expect(panel.className).toContain("animate-arrive-rise");
	});
});
