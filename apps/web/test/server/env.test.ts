import { describe, expect, it, vi } from "vitest";
import {
	productionEnvProblems,
	publicBaseUrl,
	requireAdminEmail,
	requireProductionEnv,
} from "@/server/env";

vi.mock("server-only", () => ({}));

describe("requireAdminEmail", () => {
	it("returns the trimmed value", () => {
		expect(requireAdminEmail({ ADMIN_EMAIL: " a@x.com " })).toBe("a@x.com");
	});
	it.each([undefined, "", "  "])("throws for %j", (v) => {
		expect(() => requireAdminEmail({ ADMIN_EMAIL: v })).toThrow(
			"ADMIN_EMAIL is not set. Add ADMIN_EMAIL=<email> to apps/web/.env.local",
		);
	});
	it.each([
		"a",
		"@x.com",
		"a@",
		"a@@x.com",
		"a@b@x.com",
		"a b@x.com",
		"a@x .com",
		"a@x.com,b@x.com",
		"a@x.com;b@x.com",
	])("rejects the malformed address %j", (v) => {
		expect(() => requireAdminEmail({ ADMIN_EMAIL: v })).toThrow(
			"ADMIN_EMAIL must be a single email address",
		);
	});
	it("never echoes the value in the error", () => {
		try {
			requireAdminEmail({ ADMIN_EMAIL: "secret@x.com,other@x.com" });
			expect.unreachable();
		} catch (error) {
			expect((error as Error).message).not.toContain("secret");
		}
	});
});

const GOOD = {
	NODE_ENV: "production",
	ADMIN_EMAIL: "admin@agentcheck.dev",
	DATABASE_URL: "postgres://u:p@db:5432/agentcheck",
	IP_HASH_SECRET: "x".repeat(32),
	PUBLIC_BASE_URL: "https://agentcheck.dev",
	CLERK_SECRET_KEY: "sk_live_x",
	NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_x",
	CLERK_WEBHOOK_SIGNING_SECRET: "whsec_x",
};

describe("productionEnvProblems", () => {
	it("accepts a complete production configuration", () => {
		expect(productionEnvProblems(GOOD)).toEqual([]);
	});

	it("lists every missing variable at once", () => {
		const problems = productionEnvProblems({ NODE_ENV: "production" });
		for (const name of [
			"ADMIN_EMAIL",
			"DATABASE_URL",
			"IP_HASH_SECRET",
			"PUBLIC_BASE_URL",
			"CLERK_SECRET_KEY",
			"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
			"CLERK_WEBHOOK_SIGNING_SECRET",
		]) {
			expect(problems.some((p) => p.startsWith(name))).toBe(true);
		}
	});

	it("wants a long IP_HASH_SECRET", () => {
		expect(productionEnvProblems({ ...GOOD, IP_HASH_SECRET: "short" })).toEqual(
			["IP_HASH_SECRET must be at least 32 characters"],
		);
	});

	it.each([
		"agentcheck.dev",
		"http://agentcheck.dev",
		"https://agentcheck.dev/app",
		"https://agentcheck.dev/?x=1",
		"https://user:pw@agentcheck.dev",
	])("rejects PUBLIC_BASE_URL %j", (value) => {
		expect(productionEnvProblems({ ...GOOD, PUBLIC_BASE_URL: value })).toEqual([
			"PUBLIC_BASE_URL must be an https origin such as https://agentcheck.dev",
		]);
	});

	it("accepts a trailing slash", () => {
		expect(
			productionEnvProblems({
				...GOOD,
				PUBLIC_BASE_URL: "https://agentcheck.dev/",
			}),
		).toEqual([]);
	});

	it("never echoes secret values", () => {
		const problems = productionEnvProblems({
			...GOOD,
			IP_HASH_SECRET: "secret-value",
		});
		expect(problems.join(" ")).not.toContain("secret-value");
	});
});

describe("requireProductionEnv", () => {
	it("throws one error naming every problem", () => {
		expect(() => requireProductionEnv({ NODE_ENV: "production" })).toThrow(
			/Invalid production configuration:[\s\S]*IP_HASH_SECRET[\s\S]*PUBLIC_BASE_URL/,
		);
	});

	it("passes a complete configuration", () => {
		expect(() => requireProductionEnv(GOOD)).not.toThrow();
	});
});

describe("publicBaseUrl", () => {
	it("returns the origin without a trailing slash", () => {
		expect(publicBaseUrl({ PUBLIC_BASE_URL: "https://agentcheck.dev/" })).toBe(
			"https://agentcheck.dev",
		);
	});
	it("is null when unset", () => {
		expect(publicBaseUrl({})).toBeNull();
	});
});
