import { describe, expect, it, vi } from "vitest";
import { hostKey, normaliseTargetUrl } from "@/server/target-url";

vi.mock("server-only", () => ({}));

describe("normaliseTargetUrl", () => {
	it("adds https:// when the scheme is missing", () => {
		expect(normaliseTargetUrl("example.com")).toEqual({
			ok: true,
			url: "https://example.com/",
			host: "example.com",
		});
	});

	it("trims the input", () => {
		expect(normaliseTargetUrl("  example.com  ")).toMatchObject({
			ok: true,
			url: "https://example.com/",
		});
	});

	it("keeps the path and query and keys the host without www.", () => {
		expect(normaliseTargetUrl("https://WWW.Example.com/path?q=1")).toEqual({
			ok: true,
			url: "https://www.example.com/path?q=1",
			host: "example.com",
		});
	});

	it("drops the fragment", () => {
		expect(normaliseTargetUrl("https://example.com/page#section")).toEqual({
			ok: true,
			url: "https://example.com/page",
			host: "example.com",
		});
	});

	it.each([
		[
			"https://user:secret@example.com/",
			"Remove the user name and password from the URL",
		],
		[
			"https://user@example.com/",
			"Remove the user name and password from the URL",
		],
		["http://127.0.0.1/", "Target address is not allowed: address 127.0.0.1"],
		["http://localhost/", "Target address is not allowed: host localhost"],
		["http://[::1]/", "Target address is not allowed: address ::1"],
		["ftp://example.com", "Target address is not allowed: scheme ftp:"],
		["https://example.com:8443/", "Target address is not allowed: port 8443"],
		["not a url", "Enter a valid http(s) URL"],
		["", "Enter a valid http(s) URL"],
	])("refuses %j", (input, message) => {
		expect(normaliseTargetUrl(input)).toEqual({ ok: false, message });
	});
});

describe("hostKey", () => {
	it("lowercases and strips a trailing dot and one leading www.", () => {
		expect(hostKey(new URL("https://WWW.Example.COM./"))).toBe("example.com");
		expect(hostKey(new URL("https://www.www.example.com/"))).toBe(
			"www.example.com",
		);
		expect(hostKey(new URL("https://sub.example.com/"))).toBe(
			"sub.example.com",
		);
	});
});
