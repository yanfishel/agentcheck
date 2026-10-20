import { disabledRenderer } from "@agentcheck/core";
import { mockRoutes } from "@agentcheck/core/test-helpers";
import { afterEach, describe, expect, it, vi } from "vitest";
import realPkg from "../package.json" with { type: "json" };

const ORIGIN = "https://example.com";
const FAKE_VERSION = "9.9.9";

afterEach(() => {
	vi.doUnmock("../package.json");
	vi.resetModules();
});

async function loadRun() {
	vi.resetModules();
	vi.doMock("../package.json", () => ({
		default: { ...realPkg, version: FAKE_VERSION },
	}));
	return (await import("../src/main.js")).run;
}

describe("CLI version source", () => {
	it("prints the CLI package version for --version", async () => {
		const run = await loadRun();
		let stdout = "";
		const code = await run(["--version"], {
			env: {},
			isTTY: false,
			stdout: (s) => {
				stdout += s;
			},
			stderr: () => {},
			renderer: disabledRenderer(),
		});
		expect(code).toBe(0);
		expect(stdout).toBe(`${FAKE_VERSION}\n`);
	});

	it("uses the CLI version in the report header and the User-Agent", async () => {
		const run = await loadRun();
		const userAgents: string[] = [];
		const record = (h: Record<string, string>) => {
			const ua = h["user-agent"] ?? h["User-Agent"];
			if (ua) userAgents.push(ua);
		};
		const dispatcher = mockRoutes(ORIGIN, {
			"/": {
				status: 200,
				contentType: "text/html",
				body: "<html></html>",
				onRequest: record,
			},
			"/robots.txt": {
				status: 200,
				contentType: "text/plain",
				body: "User-agent: *\nAllow: /",
			},
		});
		let stdout = "";
		await run([ORIGIN, "--no-browser"], {
			env: {},
			isTTY: false,
			stdout: (s) => {
				stdout += s;
			},
			stderr: () => {},
			dispatcher,
			renderer: disabledRenderer(),
		});
		expect(stdout).toContain(
			` AgentCheck v${FAKE_VERSION} — AI-Readiness Audit`,
		);
		expect(userAgents.length).toBeGreaterThan(0);
		for (const ua of userAgents) {
			expect(ua).toBe(`AgentCheck/${FAKE_VERSION} (+https://agentcheck.dev)`);
		}
	});
});
