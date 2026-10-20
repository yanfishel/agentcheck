import { describe, expect, it } from "vitest";
import { createGuardedBrowserRenderer } from "../../src/browser/guarded.ts";
import { type Launcher, launchBrowser } from "../../src/browser/launch.ts";
import { createBrowserRenderer } from "../../src/browser/render.ts";
import type { Resolve } from "../../src/net/guarded-lookup.ts";

/** A launcher that records its sandbox argument and never starts a browser. */
function recording() {
	const sandboxes: (boolean | undefined)[] = [];
	const launcher: Launcher = async (_engine, _timeout, _proxy, sandbox) => {
		sandboxes.push(sandbox);
		throw new Error("no browser in this test");
	};
	return { launcher, sandboxes };
}

const resolve: Resolve = async () => [{ address: "93.184.216.34", family: 4 }];

describe("Chromium sandbox", () => {
	it("launchBrowser passes sandbox to the launcher", async () => {
		const on = recording();
		await launchBrowser(on.launcher, undefined, undefined, true);
		expect(on.sandboxes[0]).toBe(true);
		const plain = recording();
		await launchBrowser(plain.launcher);
		expect(plain.sandboxes[0]).toBeUndefined();
	});

	it("the guarded renderer launches with the sandbox on", async () => {
		const { launcher, sandboxes } = recording();
		const renderer = createGuardedBrowserRenderer({ launcher, resolve });
		const result = await renderer.render("https://example.com/", {});
		expect(result.kind).toBe("unavailable");
		expect(sandboxes.length).toBeGreaterThan(0);
		expect(sandboxes.every((s) => s === true)).toBe(true);
	});

	it("the plain renderer leaves the sandbox to Playwright", async () => {
		const { launcher, sandboxes } = recording();
		await createBrowserRenderer({ launcher }).render(
			"https://example.com/",
			{},
		);
		expect(sandboxes.length).toBeGreaterThan(0);
		expect(sandboxes.every((s) => s === undefined)).toBe(true);
	});
});
