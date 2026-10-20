import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { defaultUserAgent, VERSION } from "../src/version.ts";

describe("defaultUserAgent", () => {
	it("defaults to the core package version and homepage", () => {
		expect(VERSION).toBe(pkg.version);
		expect(defaultUserAgent()).toBe(
			`AgentCheck/${pkg.version} (+https://agentcheck.dev)`,
		);
	});

	it("uses a passed version instead of the default", () => {
		expect(defaultUserAgent("9.8.7")).toBe(
			"AgentCheck/9.8.7 (+https://agentcheck.dev)",
		);
	});
});
