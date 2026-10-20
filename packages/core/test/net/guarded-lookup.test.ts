import type { LookupAddress } from "node:dns";
import { describe, expect, it } from "vitest";
import {
	createGuardedLookup,
	type Resolve,
} from "../../src/net/guarded-lookup.ts";

type Result = {
	err: Error | null;
	address: string | LookupAddress[];
	family?: number;
};

function run(
	resolve: Resolve,
	hostname: string,
	options: Parameters<ReturnType<typeof createGuardedLookup>>[1] = {},
): Promise<Result> {
	return new Promise((done) => {
		createGuardedLookup(resolve)(hostname, options, (err, address, family) =>
			done({ err, address, family }),
		);
	});
}

const a4 = (address: string) => ({ address, family: 4 as const });
const a6 = (address: string) => ({ address, family: 6 as const });

describe("createGuardedLookup", () => {
	it("returns a public address", async () => {
		const r = await run(async () => [a4("8.8.8.8")], "ok.test");
		expect(r).toEqual({ err: null, address: "8.8.8.8", family: 4 });
	});

	it("drops a private address when a public one is also present", async () => {
		const r = await run(
			async () => [a4("10.0.0.1"), a4("8.8.8.8")],
			"mixed.test",
		);
		expect(r.err).toBeNull();
		expect(r.address).toBe("8.8.8.8");
	});

	it("fails when only private addresses resolve", async () => {
		const r = await run(async () => [a4("10.0.0.1")], "evil.test");
		expect(r.err?.message).toBe(
			"Target address is not allowed: no allowed address for evil.test",
		);
	});

	it("fails when nothing resolves", async () => {
		const r = await run(async () => [], "none.test");
		expect(r.err?.message).toContain("no allowed address for none.test");
	});

	it("returns only allowed entries with all: true", async () => {
		const r = await run(
			async () => [
				a4("10.0.0.1"),
				a4("8.8.8.8"),
				a6("::1"),
				a6("2606:4700:4700::1111"),
			],
			"mixed.test",
			{ all: true },
		);
		expect(r.err).toBeNull();
		expect(r.address).toEqual([
			{ address: "8.8.8.8", family: 4 },
			{ address: "2606:4700:4700::1111", family: 6 },
		]);
	});

	it("honours the requested family", async () => {
		const resolve = async () => [a4("8.8.8.8"), a6("2606:4700:4700::1111")];
		const six = await run(resolve, "dual.test", { family: 6 });
		expect(six.address).toBe("2606:4700:4700::1111");
		expect(six.family).toBe(6);
		const four = await run(resolve, "dual.test", { family: 4 });
		expect(four.address).toBe("8.8.8.8");
	});

	it("blocks when the only allowed address is of another family", async () => {
		const r = await run(async () => [a4("8.8.8.8"), a6("::1")], "dual.test", {
			family: 6,
		});
		expect(r.err?.message).toContain("no allowed address for dual.test");
	});

	it("blocks IPv4-mapped and embedded private addresses", async () => {
		const r = await run(
			async () => [
				a6("::ffff:127.0.0.1"),
				a6("::127.0.0.1"),
				a6("2002:7f00:1::1"),
			],
			"sneaky.test",
		);
		expect(r.err?.message).toContain("no allowed address for sneaky.test");
	});

	it("propagates resolver failures", async () => {
		const r = await run(async () => {
			throw new Error("ENOTFOUND");
		}, "gone.test");
		expect(r.err?.message).toBe("ENOTFOUND");
	});
});
