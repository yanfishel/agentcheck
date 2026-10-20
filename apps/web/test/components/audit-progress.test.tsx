// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditProgress, QUEUE_STALL_MS } from "@/components/audit-progress";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

let status = "queued";

beforeEach(() => {
	vi.useFakeTimers();
	status = "queued";
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ status })),
	);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const STALLED = /waiting in the queue longer than usual/i;

function renderProgress(
	props: Partial<{ status: "queued" | "running"; queuedMs: number }> = {},
) {
	render(
		<AuditProgress
			id="a1"
			status={props.status ?? "queued"}
			url="https://example.com/"
			mode="quick"
			queuedMs={props.queuedMs ?? 0}
		/>,
	);
}

async function advance(ms: number) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

describe("AuditProgress queue notice", () => {
	it("stays quiet while a fresh audit waits", async () => {
		renderProgress();
		await advance(QUEUE_STALL_MS - 2_000);
		expect(screen.queryByText(STALLED)).toBeNull();
	});

	it("explains a long wait once the audit has been queued too long", async () => {
		renderProgress();
		await advance(QUEUE_STALL_MS + 2_000);
		expect(screen.getByText(STALLED)).toBeInTheDocument();
	});

	it("counts the time the audit spent queued before the page opened", () => {
		renderProgress({ queuedMs: QUEUE_STALL_MS + 1 });
		expect(screen.getByText(STALLED)).toBeInTheDocument();
	});

	it("drops the notice once the audit starts running", async () => {
		renderProgress({ queuedMs: QUEUE_STALL_MS + 1 });
		status = "running";
		await advance(2_000);
		expect(screen.queryByText(STALLED)).toBeNull();
	});

	it("never shows it for a running audit", () => {
		renderProgress({ status: "running", queuedMs: QUEUE_STALL_MS * 10 });
		expect(screen.queryByText(STALLED)).toBeNull();
	});
});

describe("AuditProgress layout", () => {
	it("shows the host as the heading and the status inside the ring", async () => {
		renderProgress();
		expect(
			screen.getByRole("heading", { level: 1, name: "example.com" }),
		).toBeInTheDocument();
		expect(screen.getByText("Queued")).toBeInTheDocument();
		status = "running";
		await advance(2_000);
		expect(screen.getByText("Running")).toBeInTheDocument();
	});

	it("shows the globe on the band's URL line", () => {
		renderProgress();
		const line = screen.getByText("https://example.com/").closest("p");
		expect(line?.querySelector("img")).toBeNull();
		expect(line?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
	});

	it("draws an empty tile for every category, in the report order", () => {
		renderProgress();
		const tiles = screen.getByRole("list", { name: "Categories" });
		expect(
			Array.from(tiles.querySelectorAll("li"), (li) => li.textContent),
		).toEqual([
			"AI Manifests",
			"Bot Access",
			"Content & Semantics",
			"Agentic Actionability",
		]);
	});
});
