import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

const runs = (path: string) =>
	config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path));

describe("proxy matcher", () => {
	it.each([
		"/",
		"/docs",
		"/zip",
		"/xdocs",
		"/xcss",
		"/history",
		"/admin/users",
		"/api/x",
	])("runs the middleware for %s", (path) => {
		expect(runs(path)).toBe(true);
	});

	it.each(["/logo.png", "/_next/static/x.js"])(
		"skips static asset %s",
		(path) => {
			expect(runs(path)).toBe(false);
		},
	);
});
