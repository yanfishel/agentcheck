import { describe, expect, it } from "vitest";
import {
	blockedMessage,
	checkUrl,
	isBlockedAddress,
} from "../../src/net/policy.ts";

const BLOCKED_ADDRESSES = [
	// IPv4: first address and one inside each range
	"0.0.0.0",
	"0.1.2.3",
	"10.0.0.0",
	"10.20.30.40",
	"100.64.0.0",
	"100.64.0.1",
	"127.0.0.0",
	"127.0.0.1",
	"169.254.0.0",
	"169.254.169.254",
	"172.16.0.0",
	"172.16.0.1",
	"172.31.255.255",
	"192.0.0.0",
	"192.0.0.8",
	"192.0.2.0",
	"192.0.2.55",
	"192.168.0.0",
	"192.168.1.1",
	"198.18.0.0",
	"198.19.255.255",
	"198.51.100.0",
	"198.51.100.9",
	"203.0.113.0",
	"203.0.113.9",
	"224.0.0.0",
	"239.1.2.3",
	"240.0.0.0",
	"255.255.255.255",
	// IPv6
	"::",
	"::1",
	"fc00::",
	"fd12:3456::1",
	"fe80::",
	"fe80::1",
	"ff00::",
	"ff02::1",
	"64:ff9b::",
	"64:ff9b::808:808",
	"2001:db8::",
	"2001:db8::1",
	// IPv4-mapped
	"::ffff:10.0.0.1",
	"::ffff:127.0.0.1",
	"::ffff:7f00:1",
	// IPv4-compatible and transition ranges
	"::127.0.0.1",
	"::7f00:1",
	"::808:808",
	"::ffff:0:808:808",
	"::ffff:0:7f00:1",
	"64:ff9b:1::",
	"64:ff9b:1:ffff::1",
	"fec0::",
	"feff::1",
	"2002::",
	"2002:7f00:1::1",
	"2002:808:808::",
	"2001::",
	"2001:0:4136:e378:8000:63bf:3fff:fdd2",
];

const ALLOWED_ADDRESSES = [
	"8.8.8.8",
	"1.1.1.1",
	"93.184.216.34",
	"172.15.255.255",
	"172.32.0.0",
	"100.63.255.255",
	"100.128.0.0",
	"2606:4700:4700::1111",
	"::ffff:8.8.8.8",
	"::ffff:808:808",
	"2001:1::1",
	"2003::1",
	"64:ff9b:2::1",
];

describe("isBlockedAddress", () => {
	it.each(BLOCKED_ADDRESSES)("blocks %s", (ip) => {
		expect(isBlockedAddress(ip)).toBe(true);
	});

	it.each(ALLOWED_ADDRESSES)("allows %s", (ip) => {
		expect(isBlockedAddress(ip)).toBe(false);
	});

	it("treats a non-IP string as not blocked", () => {
		expect(isBlockedAddress("example.com")).toBe(false);
	});
});

describe("checkUrl", () => {
	it.each([
		"https://example.com/",
		"http://example.com/",
		"https://example.com:443/",
		"http://example.com:80/",
		"http://93.184.216.34/",
		"https://[2606:4700:4700::1111]/",
	])("accepts %s", (input) => {
		const result = checkUrl(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.url).toBeInstanceOf(URL);
	});

	it.each([
		["ftp://example.com", "scheme ftp:"],
		["file:///etc/passwd", "scheme file:"],
		["http://example.com:8080/", "port 8080"],
		["http://localhost/", "host localhost"],
		["http://LOCALHOST/", "host localhost"],
		["http://localhost./", "host localhost."],
		["http://app.localhost/", "host app.localhost"],
		["http://127.0.0.1/", "address 127.0.0.1"],
		["http://127.1/", "address 127.0.0.1"],
		["http://0x7f.0.0.1/", "address 127.0.0.1"],
		["http://0x7f.1/", "address 127.0.0.1"],
		["http://2130706433/", "address 127.0.0.1"],
		["http://[::1]/", "address ::1"],
		["http://[::ffff:127.0.0.1]/", "address 127.0.0.1"],
		["http://169.254.169.254/", "address 169.254.169.254"],
		["http://10.0.0.5/", "address 10.0.0.5"],
	])("rejects %s with %s", (input, reason) => {
		expect(checkUrl(input)).toEqual({ ok: false, reason });
	});

	it("never echoes unparsable input in the reason", () => {
		expect(checkUrl("not a url with secret=abc")).toEqual({
			ok: false,
			reason: "host <invalid>",
		});
	});

	it("returns a fresh URL copy for URL input", () => {
		const input = new URL("https://example.com/");
		const result = checkUrl(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.url).not.toBe(input);
			expect(result.url.href).toBe(input.href);
		}
	});

	it("accepts a URL object", () => {
		expect(checkUrl(new URL("https://example.com/")).ok).toBe(true);
		expect(checkUrl(new URL("http://127.0.0.1/"))).toEqual({
			ok: false,
			reason: "address 127.0.0.1",
		});
	});

	it("honours allowPorts against the effective port", () => {
		expect(
			checkUrl("http://example.com:8080/", { allowPorts: [8080] }).ok,
		).toBe(true);
		expect(checkUrl("http://example.com/", { allowPorts: [8080] })).toEqual({
			ok: false,
			reason: "port 80",
		});
		expect(checkUrl("https://example.com/", { allowPorts: [443] }).ok).toBe(
			true,
		);
	});
});

describe("blockedMessage", () => {
	it("prefixes the reason", () => {
		expect(blockedMessage("port 22")).toBe(
			"Target address is not allowed: port 22",
		);
	});
});
