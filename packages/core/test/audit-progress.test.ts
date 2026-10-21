import { describe, expect, it, vi } from "vitest";
import { guardedAuditOptions, runAudit } from "../src/audit.ts";
import type { FinishedCheck } from "../src/progress.ts";
import { CHECKS } from "../src/registry.ts";
import type { Check } from "../src/types.ts";
import { mockRoutes } from "./helpers/mock-site.ts";

const ICO = new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16]);
const routes = () => ({
	"/": { status: 200, contentType: "text/html", body: "<html></html>" },
	"/robots.txt": {
		status: 200,
		contentType: "text/plain",
		body: "User-agent: *\nAllow: /",
	},
	"/favicon.ico": { status: 200, contentType: "image/x-icon", body: ICO },
});
const base = () => ({
	userAgent: "test",
	dispatcher: mockRoutes("https://example.com", routes()),
	now: () => new Date("2026-01-01T00:00:00.000Z"),
});

describe("runAudit progress", () => {
	it("calls onCheck once per check with its category", async () => {
		const seen: FinishedCheck[] = [];
		await runAudit("https://example.com/", {
			...base(),
			onCheck: (c) => seen.push(c),
		});
		expect(seen).toHaveLength(CHECKS.length);
		expect(seen.map((c) => c.id).sort()).toEqual(
			CHECKS.map((c) => c.id).sort(),
		);
		for (const c of seen) {
			expect(c.category).toBe(CHECKS.find((k) => k.id === c.id)?.category);
		}
	});

	it("a throwing onCheck does not change the result", async () => {
		const plain = await runAudit("https://example.com/", base());
		const throwing = await runAudit("https://example.com/", {
			...base(),
			onCheck: () => {
				throw new Error("boom");
			},
		});
		expect(throwing).toEqual(plain);
	});

	it("onFavicon fires while a slow check is still pending", async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const slow: Check = {
			id: "slow",
			title: "Slow",
			category: "bot-access",
			weight: 1,
			run: async () => {
				await gate;
				return { status: "pass", message: "ok" };
			},
		};
		let icon = false;
		const done = runAudit("https://example.com/", {
			...base(),
			checks: [slow],
			onFavicon: () => {
				icon = true;
			},
		});
		await vi.waitFor(() => expect(icon).toBe(true), { timeout: 2000 });
		release();
		await done;
	});

	it("a crashed check still reaches onCheck with the crash result", async () => {
		const boom: Check = {
			id: "boom",
			title: "Boom",
			category: "bot-access",
			weight: 1,
			run: async () => {
				throw new Error("kaput");
			},
		};
		const seen: FinishedCheck[] = [];
		await runAudit("https://example.com/", {
			...base(),
			checks: [boom],
			onCheck: (c) => seen.push(c),
		});
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({
			id: "boom",
			category: "bot-access",
			status: "fail",
			message: "Check crashed: kaput",
		});
	});

	it("guardedAuditOptions passes onCheck through", () => {
		const onCheck = () => {};
		expect(
			Object.keys(
				guardedAuditOptions({ userAgent: "x", browser: false, onCheck }),
			),
		).toContain("onCheck");
		expect(
			Object.keys(guardedAuditOptions({ userAgent: "x", browser: false })),
		).not.toContain("onCheck");
	});
});
