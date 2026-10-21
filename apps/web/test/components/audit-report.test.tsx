// @vitest-environment jsdom
import type { AuditResult } from "@agentcheck/core";
import { within } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	AuditReport,
	categoryMarker,
	checkMarker,
} from "@/components/audit-report";
import { ToastProvider } from "@/components/ui";

type CategoryResult = AuditResult["categories"][number];

const result: AuditResult = {
	tool: { name: "agentcheck", version: "0.1.0" },
	target: "https://example.com",
	finalUrl: "https://www.example.com/",
	timestamp: "2026-10-19T10:00:00.000Z",
	score: 98,
	grade: "A+",
	browser: { used: false, reason: "Chrome is not installed" },
	categories: [
		{
			id: "ai-manifests",
			title: "AI Manifests",
			weight: 30,
			status: "scored",
			score: 100,
			checks: [
				{
					id: "llms-txt",
					title: "llms.txt",
					weight: 1,
					status: "pass",
					message: "/llms.txt found and valid",
				},
			],
		},
		{
			id: "bot-access",
			title: "Bot Access",
			weight: 20,
			status: "scored",
			score: 60,
			checks: [
				{
					id: "ai-bots-allowed",
					title: "AI bots allowed",
					weight: 1,
					status: "fail",
					message: "robots.txt blocks GPTBot",
					details: ["GPTBot"],
					remediation: "Allow GPTBot in robots.txt",
				},
				{
					id: "noai",
					title: "noai",
					weight: 1,
					status: "skip",
					message: "No HTML page to inspect",
					remediation: "Hidden skip remediation",
				},
			],
		},
		{
			id: "content-semantics",
			title: "Content & Semantics",
			weight: 25,
			status: "scored",
			score: 92,
			checks: [
				{
					id: "headings",
					title: "Headings",
					weight: 1,
					status: "warn",
					message: "Heading skip detected",
					details: ["h2 -> h4 in /how-it-works"],
					remediation: "Use consecutive heading levels",
				},
			],
		},
		{
			id: "agentic-actionability",
			title: "Agentic Actionability",
			weight: 25,
			status: "skipped",
			score: null,
			skipReason: "Browser not available",
			checks: [],
		},
	],
};

const scored = (score: number): CategoryResult => ({
	id: "ai-manifests",
	title: "AI Manifests",
	weight: 30,
	status: "scored",
	score,
	checks: [],
});

function render(node: ReactElement): string {
	return renderToStaticMarkup(<ToastProvider>{node}</ToastProvider>);
}

/** The markup of one category card, from its id to the next card. */
function section(html: string, id: string): string {
	const start = html.indexOf(`id="category-${id}"`);
	expect(start).toBeGreaterThan(-1);
	const next = html.indexOf('id="category-', start + 1);
	return html.slice(start, next === -1 ? undefined : next);
}

describe("AuditReport", () => {
	const html = render(<AuditReport result={result} mode="quick" />);

	it("renders categories in result order", () => {
		const positions = result.categories.map((c) =>
			html.indexOf(`id="category-${c.id}"`),
		);
		for (const position of positions) expect(position).toBeGreaterThan(-1);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
		for (const c of result.categories) {
			expect(html).toContain(c.title.replace("&", "&amp;"));
		}
	});

	it("shows category scores and skipped categories with the reason", () => {
		expect(html).toContain("92");
		expect(html).toContain("skipped");
		expect(section(html, "agentic-actionability")).toContain(
			"Browser not available",
		);
	});

	it("puts the category aside under the header, outside the collapsed panel", () => {
		const withAside = render(
			<AuditReport
				result={result}
				mode="quick"
				defaultOpen="none"
				categoryAside={(category) =>
					category.status === "skipped" ? (
						<span data-testid="aside">Offer for {category.id}</span>
					) : null
				}
			/>,
		);
		const skipped = section(withAside, "agentic-actionability");
		expect(skipped).toContain("Offer for agentic-actionability");
		// Outside the trigger button and after the (hidden) panel, as a sibling.
		expect(skipped.indexOf("Offer for")).toBeGreaterThan(
			skipped.lastIndexOf("hidden="),
		);
		expect(section(withAside, "ai-manifests")).not.toContain("Offer for");
		expect(html).not.toContain("Offer for");
	});

	it("shows every check message, closed categories included", () => {
		for (const message of [
			"/llms.txt found and valid",
			"robots.txt blocks GPTBot",
			"No HTML page to inspect",
			"Heading skip detected",
		]) {
			expect(html).toContain(message);
		}
	});

	it("shows remediation as a plaque only for warn and fail checks", () => {
		expect(html).not.toContain("→");
		expect(html.match(/<p class="[^"]*bg-accent-soft[^"]*"/g)).toHaveLength(2);
		expect(html).toContain("Allow GPTBot in robots.txt");
		expect(html).toContain("Use consecutive heading levels");
		expect(html).not.toContain("Hidden skip remediation");
	});

	it("marks every check with its status for screen readers", () => {
		for (const status of ["pass", "fail", "skip", "warn"]) {
			expect(html).toContain(`<span class="sr-only">${status}: </span>`);
		}
	});

	it("shows check details", () => {
		expect(html).toContain("h2 -&gt; h4 in /how-it-works");
	});

	it("shows the score, grade, host and run metadata in the band", () => {
		expect(html).toContain("bg-accent text-accent-fg");
		expect(html).toMatch(/>98<\/span>/);
		expect(html).toContain("of 100");
		expect(html).toContain("A+");
		expect(html).toMatch(/<h1[^>]*>example\.com<\/h1>/);
		expect(html).toContain("Quick");
		expect(html).toContain("No browser");
		expect(html).toContain('dateTime="2026-10-19T10:00:00.000Z"');
		expect(html).toContain("Redirected to");
		// The version lives in the site footer, not under each report.
		expect(html).not.toContain("AgentCheck v0.1.0");
		expect(html).not.toContain("OVERALL AI SCORE");
	});

	it("omits the redirect line when the final URL matches and shows a used browser", () => {
		const same = render(
			<AuditReport
				result={{
					...result,
					finalUrl: result.target,
					browser: {
						used: true,
						engine: "chrome",
						version: "130.0.1",
						renderMs: 1234,
					},
				}}
			/>,
		);
		expect(same).not.toContain("Redirected to");
		expect(same).toContain("Chrome 130.0.1");
	});

	it("opens only categories with warn or fail by default", () => {
		expect(section(html, "bot-access")).toContain('aria-expanded="true"');
		expect(section(html, "content-semantics")).toContain(
			'aria-expanded="true"',
		);
		expect(section(html, "ai-manifests")).toContain('aria-expanded="false"');
		expect(section(html, "agentic-actionability")).not.toContain(
			'aria-expanded="true"',
		);
	});

	it("keeps every category closed with defaultOpen none", () => {
		const closed = render(<AuditReport result={result} defaultOpen="none" />);
		expect(closed).not.toContain('aria-expanded="true"');
	});

	it("shows no per-check fix snippets", () => {
		const bots = section(html, "bot-access");
		expect(bots).not.toContain("User-agent: GPTBot");
		expect(html).not.toContain(">Copy<");
	});

	it("renders the fix files slot and a footer per category", () => {
		const slotted = render(
			<AuditReport
				result={result}
				fixFiles={<p>FIX-FILES-SLOT</p>}
				categoryFooter={(id) => <p>{`FOOTER-${id}`}</p>}
			/>,
		);
		expect(slotted).toContain("FIX-FILES-SLOT");
		expect(slotted.indexOf("FIX-FILES-SLOT")).toBeLessThan(
			slotted.indexOf('id="category-ai-manifests"'),
		);
		expect(section(slotted, "bot-access")).toContain("FOOTER-bot-access");
		expect(html).not.toContain("FOOTER-");
	});

	it("renders four tiles coloured by score", () => {
		const tiles = html.match(/<a [^>]*href="#category-[^"]+"[^>]*>.*?<\/a>/g);
		expect(tiles).toHaveLength(4);
		expect(tiles?.[0]).toContain("text-pass");
		expect(tiles?.[0]).toContain(">100<");
		expect(tiles?.[1]).toContain("text-warn");
		expect(tiles?.[1]).toContain(">60<");
		expect(tiles?.[3]).toContain("text-muted");
	});

	it("example variant shows the Example chip and no actions", () => {
		const example = render(
			<AuditReport
				result={result}
				variant="example"
				actions={<button type="button">Run again</button>}
			/>,
		);
		expect(example).toContain("Example");
		expect(example).not.toContain("Run again");
		expect(example).not.toContain("<h1");
	});

	it("full variant shows the label chip and the actions", () => {
		const shared = render(
			<AuditReport
				result={result}
				label="Shared report"
				actions={<button type="button">Get badge</button>}
			/>,
		);
		expect(shared).toContain("Shared report");
		expect(shared).toContain("Get badge");
	});

	const screenshot = {
		small: "/api/audits/a1/screenshot",
		large: "/api/audits/a1/screenshot?size=large",
	};

	/** The static markup in a detached element, for accessible-name queries. */
	function dom(markup: string): HTMLElement {
		const container = document.createElement("div");
		container.innerHTML = markup;
		return container;
	}

	const thumbName = { name: "Open screenshot of example.com" };

	it("renders the thumbnail with the grade seal when a screenshot exists", () => {
		const page = within(
			dom(render(<AuditReport result={result} screenshot={screenshot} />)),
		);
		const button = page.getByRole("button", thumbName);
		const image = button.querySelector("img");
		expect(image?.getAttribute("src")).toBe(screenshot.small);
		expect(image?.getAttribute("alt")).toBe("");
		// The seal sits beside the button, so its name is not hidden by the button's.
		const seal = page.getByRole("img", { name: "Grade A+" });
		expect(button.contains(seal)).toBe(false);
		expect(button.parentElement?.contains(seal)).toBe(true);
	});

	it("keeps the plain grade mark without a screenshot", () => {
		const page = within(dom(render(<AuditReport result={result} />)));
		expect(page.queryByRole("button", thumbName)).toBeNull();
		// One mark for phones (beside the ring), one from sm up (after the text);
		// CSS shows exactly one of them.
		expect(page.getAllByRole("img", { name: "Grade A+" })).toHaveLength(2);
	});

	it("the example band looks like a live report, thumbnail included", () => {
		const markup = render(
			<AuditReport result={result} variant="example" screenshot={screenshot} />,
		);
		const page = within(dom(markup));
		expect(page.getByRole("button", thumbName)).toBeTruthy();
		// The live band's backdrop and large ring, on a rounded plum card.
		expect(markup).toContain("hero-glow");
		expect(markup).toContain("sm:size-32");
		expect(markup).not.toContain("<h1");
	});

	/** The band's URL line: the paragraph holding the link to the target. */
	function urlLine(markup: string): HTMLElement {
		const band = dom(markup).querySelector(
			'section[aria-label="Overall score"]',
		);
		const link = band?.querySelector(`a[href="${result.target}"]`);
		const line = link?.parentElement;
		expect(line).toBeTruthy();
		return line as HTMLElement;
	}

	it("shows the site icon on the band's URL line when a favicon exists", () => {
		const line = urlLine(
			render(<AuditReport result={result} favicon="/api/audits/a1/favicon" />),
		);
		expect(
			line.querySelector('img[src="/api/audits/a1/favicon"]'),
		).not.toBeNull();
		expect(line.querySelector("svg")).toBeNull();
	});

	it("shows the globe on the band's URL line without a favicon", () => {
		const line = urlLine(render(<AuditReport result={result} />));
		expect(line.querySelector("img")).toBeNull();
		expect(line.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
	});

	it("the example band shows the site icon it is given", () => {
		const line = urlLine(
			render(
				<AuditReport
					result={result}
					variant="example"
					favicon="/example/favicon.svg"
				/>,
			),
		);
		expect(
			line.querySelector('img[src="/example/favicon.svg"]'),
		).not.toBeNull();
	});
});

describe("categoryMarker", () => {
	it.each([
		[100, "✓"],
		[90, "✓"],
		[89, "!"],
		[50, "!"],
		[49, "✗"],
		[0, "✗"],
	])("score %i → %s", (score, marker) => {
		expect(categoryMarker(scored(score))).toBe(marker);
	});

	it("marks skipped categories with a dash", () => {
		expect(
			categoryMarker({
				...scored(0),
				status: "skipped",
				score: null,
				skipReason: "x",
			}),
		).toBe("–");
	});
});

describe("checkMarker", () => {
	it.each([
		["pass", "✓"],
		["warn", "⚠"],
		["fail", "✗"],
		["skip", "–"],
	] as const)("%s → %s", (status, marker) => {
		expect(checkMarker(status)).toBe(marker);
	});
});

describe("AuditReport confetti", () => {
	const perfect = { ...result, score: 100, grade: "A+" as const };
	const has = (node: ReactElement) => render(node).includes("data-confetti");

	it("wraps the ring of a full report that scores 100", () => {
		expect(has(<AuditReport result={perfect} mode="full" />)).toBe(true);
	});

	it("skips a quick 100, a full 99 and the landing example", () => {
		expect(has(<AuditReport result={perfect} mode="quick" />)).toBe(false);
		expect(
			has(<AuditReport result={{ ...perfect, score: 99 }} mode="full" />),
		).toBe(false);
		expect(
			has(<AuditReport result={perfect} mode="full" variant="example" />),
		).toBe(false);
	});
});
