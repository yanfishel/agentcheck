// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fire = vi.hoisted(() => vi.fn());
const loaded = vi.hoisted(() => vi.fn());

vi.mock("canvas-confetti", () => {
	loaded();
	return { default: fire };
});

import { ScoreConfetti } from "@/components/report/score-confetti";

function stubMotion(reduce: boolean) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn((query: string) => ({
			matches: reduce && query === "(prefers-reduced-motion: reduce)",
			media: query,
		})),
	);
}

/** Lets the dynamic import settle, then runs the timers up to `ms`. */
async function advance(ms: number) {
	await vi.advanceTimersByTimeAsync(ms);
}

describe("ScoreConfetti", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		fire.mockReset();
		loaded.mockReset();
		stubMotion(false);
		vi.stubGlobal("innerWidth", 1280);
		vi.stubGlobal("innerHeight", 800);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			left: 100,
			top: 100,
			width: 128,
			height: 128,
		} as DOMRect);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("fires four shots from the ring's centre", async () => {
		render(<ScoreConfetti>ring</ScoreConfetti>);
		await advance(1100);
		expect(fire).toHaveBeenCalledTimes(4);
		const colors = ["#4fd1b0", "#ffffff", "#dc92cc", "#ffbe96", "#6e2a5e"];
		expect(fire.mock.calls[0]?.[0]).toEqual({
			origin: { x: 164 / 1280 - 0.04, y: 164 / 800 },
			particleCount: 60,
			spread: 80,
			startVelocity: 34,
			ticks: 220,
			scalar: 0.9,
			colors,
			disableForReducedMotion: true,
		});
		expect(fire.mock.calls[3]?.[0]).toMatchObject({
			origin: { x: 164 / 1280 + 0.04, y: 164 / 800 },
			spread: 110,
			startVelocity: 43,
		});
	});

	it("does not fire again when re-rendered", async () => {
		const { rerender } = render(<ScoreConfetti>a</ScoreConfetti>);
		await advance(1100);
		rerender(<ScoreConfetti>b</ScoreConfetti>);
		await advance(2000);
		expect(fire).toHaveBeenCalledTimes(4);
	});

	it("neither fires nor loads the library with reduced motion", async () => {
		stubMotion(true);
		render(<ScoreConfetti>ring</ScoreConfetti>);
		await advance(2000);
		expect(fire).not.toHaveBeenCalled();
		expect(loaded).not.toHaveBeenCalled();
	});

	it("stops when unmounted", async () => {
		const { unmount } = render(<ScoreConfetti>ring</ScoreConfetti>);
		await advance(10);
		expect(fire).toHaveBeenCalledTimes(1);
		unmount();
		await advance(2000);
		expect(fire).toHaveBeenCalledTimes(1);
	});
});
