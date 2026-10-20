import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { ToastProvider } from "@/components/ui";

// The form is a client island; these stubs only let it render on the server.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({
	useClerk: () => ({ openSignIn: vi.fn() }),
	useAuth: () => ({ isSignedIn: false }),
}));

const srcDir = fileURLToPath(new URL("../../src", import.meta.url));

describe("Home", () => {
	it("renders the landing without a database or Clerk", () => {
		// The root layout mounts ToastProvider; the example report's copy buttons need it.
		const html = renderToStaticMarkup(
			<ToastProvider>
				<Home />
			</ToastProvider>,
		);
		for (const text of [
			"Is your site ready for AI agents?",
			"What an AI reads before it reads you",
			"Fair questions",
			"How it works",
			"Example report",
			"AI Ready",
			// The terminal tab is the real reporter run on the example audit.
			"OVERALL AI SCORE: 80 / 100 [B]",
			// The closing band repeats the form; the example's button leads to it.
			"Check your site now",
			'id="check-now"',
			">Check your site<",
			"runs-on",
			'aria-label="Copy command"',
		]) {
			expect(html).toContain(text);
		}
		expect(html).toContain("https://www.npmjs.com/package/agentcheck");
		// Each guide card shows its weight as a ring, from the scoring module.
		for (const weight of [20, 30, 25]) {
			expect(html).toContain(`aria-label="${weight}% of the score"`);
		}
		// Guide cards follow the scoring module's order, the one order everywhere.
		const positions = [
			"llms.txt is a table of contents",
			"robots.txt says who may come in",
			"Structure tells it what the page is",
			"Buttons with names let agents act",
		].map((title) => html.indexOf(title));
		expect(positions.every((p) => p >= 0)).toBe(true);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
		// The guide links each category to the official documentation.
		for (const doc of [
			"https://llmstxt.org/",
			"https://developers.openai.com/api/docs/bots",
			"https://schema.org/docs/gs.html",
			"https://www.w3.org/WAI/ARIA/apg/",
		]) {
			expect(html).toContain(`href="${doc}"`);
		}
		expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u); // no emoji
	});

	it("keeps Clerk and the database out of the page and its sections", () => {
		const landing = join(srcDir, "components", "landing");
		const files = [
			join(srcDir, "app", "page.tsx"),
			...readdirSync(landing).map((name) => join(landing, name)),
		];
		for (const file of files) {
			const source = readFileSync(file, "utf8");
			expect(source, file).not.toMatch(
				/@clerk\/|@agentcheck\/db|server\/badge"/,
			);
		}
	});
});
