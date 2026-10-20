import { describe, expect, it, vi } from "vitest";
import { clientIpKey, hashIp, ipHashSecret } from "@/server/client-ip";

vi.mock("server-only", () => ({}));

describe("client ip", () => {
	it.each([
		["203.0.113.9", "203.0.113.9"],
		["1.1.1.1, 203.0.113.9", "203.0.113.9"],
		["1.1.1.1, 2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
		["2001:DB8::1", "2001:db8:0:0::/64"],
		["::ffff:203.0.113.9", "203.0.113.9"],
		[null, "unknown"],
		["", "unknown"],
		["not an ip", "unknown"],
	])("clientIpKey(%j) = %s", (value, key) => {
		const headers = new Headers();
		if (value !== null) headers.set("x-forwarded-for", value);
		expect(clientIpKey(headers)).toBe(key);
	});

	it("hashIp is keyed", () => {
		expect(hashIp("203.0.113.9", "a")).toMatch(/^[0-9a-f]{64}$/);
		expect(hashIp("203.0.113.9", "a")).not.toBe(hashIp("203.0.113.9", "b"));
	});

	it("ipHashSecret requires the secret in production", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(() => ipHashSecret({ NODE_ENV: "production" })).toThrow(
			"IP_HASH_SECRET is not set",
		);
		expect(ipHashSecret({ NODE_ENV: "production", IP_HASH_SECRET: "s" })).toBe(
			"s",
		);
		expect(ipHashSecret({ NODE_ENV: "development" })).toBe(
			"dev-ip-hash-secret",
		);
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});
});
