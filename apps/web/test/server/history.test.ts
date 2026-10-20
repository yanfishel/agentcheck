import type { Audit } from "@agentcheck/db";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { groupAuditsByUrl, scoreTrend } = await import("@/server/history");

let seq = 0;
const audit = (over: Partial<Audit>): Audit => {
	seq += 1;
	return {
		id: `id-${seq}`,
		userId: "u1",
		ipHash: null,
		url: "https://a.test/",
		finalUrl: null,
		host: "a.test",
		mode: "quick",
		status: "done",
		result: null,
		score: 80,
		grade: "B",
		error: null,
		shareToken: null,
		hasScreenshot: false,
		hasFavicon: false,
		createdAt: new Date(Date.UTC(2026, 9, 1)),
		startedAt: null,
		finishedAt: null,
		queuedAt: new Date(Date.UTC(2026, 9, 1)),
		claimedBy: null,
		...over,
	};
};

describe("groupAuditsByUrl", () => {
	it("groups by url, newest group first, previous done score, max 5 runs", () => {
		const a = "https://a.test/";
		const b = "https://b.test/";
		const input = [
			audit({ id: "a7", url: a, score: 70 }),
			audit({ id: "b1", url: b, host: "b.test", score: 50 }),
			audit({ id: "a6", url: a, status: "failed", score: null, grade: null }),
			audit({ id: "a5", url: a, score: 60 }),
			audit({ id: "a4", url: a, score: 55 }),
			audit({ id: "a3", url: a, score: 54 }),
			audit({ id: "a2", url: a, score: 53 }),
			audit({ id: "a1", url: a, score: 52 }),
		];
		const groups = groupAuditsByUrl(input);
		expect(groups.map((g) => g.url)).toEqual([a, b]);
		const first = groups[0];
		expect(first?.latest.id).toBe("a7");
		expect(first?.runs).toHaveLength(5);
		expect(first?.runs.map((r) => r.id)).toEqual([
			"a7",
			"a6",
			"a5",
			"a4",
			"a3",
		]);
		expect(first?.previousScore).toBe(60);
		expect(groups[1]?.previousScore).toBeNull();
		expect(groups[1]?.host).toBe("b.test");
	});
});

describe("screenshotId", () => {
	it("screenshotId is the newest run with a screenshot", () => {
		const groups = groupAuditsByUrl([
			audit({ id: "A", mode: "quick" }),
			audit({ id: "B", mode: "full", hasScreenshot: true }),
			audit({ id: "C", mode: "full", hasScreenshot: true }),
		]);
		expect(groups[0]?.screenshotId).toBe("B");
		expect(groups[0]?.latest.id).toBe("A");
	});

	it("screenshotId is null without any screenshot", () => {
		const groups = groupAuditsByUrl([audit({ id: "A" }), audit({ id: "B" })]);
		expect(groups[0]?.screenshotId).toBeNull();
	});
});

describe("faviconId", () => {
	it("faviconId is the newest run with a favicon, independent of the screenshot", () => {
		const groups = groupAuditsByUrl([
			audit({ id: "A", hasFavicon: false, hasScreenshot: true }),
			audit({ id: "B", hasFavicon: true }),
			audit({ id: "C", hasFavicon: true, hasScreenshot: true }),
		]);
		expect(groups[0]?.faviconId).toBe("B");
		expect(groups[0]?.screenshotId).toBe("A");
	});

	it("faviconId is null without any favicon", () => {
		const groups = groupAuditsByUrl([audit({ id: "A" }), audit({ id: "B" })]);
		expect(groups[0]?.faviconId).toBeNull();
	});
});

describe("scoreTrend", () => {
	it.each([
		[95, 90, "+5 since last run", "pass"],
		[85, 90, "−5 since last run", "fail"],
		[90, 90, "Same as last run", "muted"],
	] as const)("scoreTrend(%i, %i)", (latest, previous, label, tone) => {
		expect(scoreTrend(latest, previous)).toEqual({ label, tone });
	});

	it("scoreTrend is null without two scores", () => {
		expect(scoreTrend(90, null)).toBeNull();
		expect(scoreTrend(null, 90)).toBeNull();
	});
});
