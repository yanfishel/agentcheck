import { describe, expect, it } from "vitest";
import { runAudit } from "../../src/audit.ts";
import type { Status } from "../../src/types.ts";
import { mockSite } from "../helpers/mock-site.ts";

type SiteName = "good" | "mixed" | "poor";

/** Expected status of every check per reference site. */
const EXPECTED: Record<SiteName, Record<string, Status>> = {
	good: {
		"ai-bots-allowed": "pass",
		"noai-directives": "pass",
		"asset-access": "pass",
		"content-signals": "pass",
		"llms-txt": "pass",
		"llms-txt-format": "pass",
		"llms-full-txt": "fail",
		"markdown-twin": "pass",
		"heading-hierarchy": "pass",
		"structured-data": "pass",
		opengraph: "pass",
		"content-density": "pass",
		"accessible-names": "skip",
		"click-targets": "skip",
		"overlay-blocking": "skip",
		"captcha-blocking": "skip",
	},
	mixed: {
		"ai-bots-allowed": "pass",
		"noai-directives": "pass",
		"asset-access": "warn",
		"content-signals": "fail",
		"llms-txt": "fail",
		"llms-txt-format": "fail",
		"llms-full-txt": "fail",
		"markdown-twin": "fail",
		"heading-hierarchy": "fail",
		"structured-data": "fail",
		opengraph: "pass",
		"content-density": "pass",
		"accessible-names": "skip",
		"click-targets": "skip",
		"overlay-blocking": "skip",
		"captcha-blocking": "skip",
	},
	poor: {
		"ai-bots-allowed": "pass",
		"noai-directives": "pass",
		"asset-access": "pass",
		"content-signals": "fail",
		"llms-txt": "pass",
		"llms-txt-format": "fail",
		"llms-full-txt": "fail",
		"markdown-twin": "pass",
		"heading-hierarchy": "fail",
		"structured-data": "fail",
		opengraph: "pass",
		"content-density": "fail",
		"accessible-names": "skip",
		"click-targets": "skip",
		"overlay-blocking": "skip",
		"captcha-blocking": "skip",
	},
};

const SITES = Object.keys(EXPECTED) as SiteName[];

async function auditSite(name: SiteName) {
	const { agent, origin } = mockSite(name);
	return runAudit(`${origin}/`, {
		userAgent: "AgentCheck-e2e",
		dispatcher: agent,
	});
}

describe.each(SITES)("reference site %s", (name) => {
	const audit = async () =>
		(await auditSite(name)).categories.flatMap((c) => c.checks);

	it.each(Object.entries(EXPECTED[name]))("%s is %s", async (id, status) => {
		const checks = await audit();
		expect(checks.find((c) => c.id === id)?.status).toBe(status);
	});

	it("lists every check", async () => {
		const ids = (await audit()).map((c) => c.id).sort();
		expect(Object.keys(EXPECTED[name]).sort()).toEqual(ids);
	});

	it("skips the agentic-actionability category", async () => {
		const result = await auditSite(name);
		const agentic = result.categories.find(
			(c) => c.id === "agentic-actionability",
		);
		expect(agentic?.status).toBe("skipped");
		expect(agentic?.score).toBeNull();
		expect(agentic?.status === "skipped" && agentic.skipReason).toBe(
			"Browser checks not enabled",
		);
	});

	it("gives every warn or fail a remediation", async () => {
		const checks = await audit();
		for (const check of checks) {
			if (check.status === "warn" || check.status === "fail") {
				expect(check.remediation, check.id).toBeTruthy();
			}
		}
	});
});

describe("reference site grades", () => {
	it("good grades A with llms-full-txt as the only non-pass check", async () => {
		const result = await auditSite("good");
		const notPassing = result.categories
			.flatMap((c) => c.checks)
			.filter((c) => c.status !== "pass" && c.status !== "skip")
			.map((c) => c.id);
		expect(notPassing).toEqual(["llms-full-txt"]);
		expect(result.grade, `score ${result.score}`).toBe("A");
	});

	it("mixed grades F", async () => {
		const result = await auditSite("mixed");
		expect(result.grade, `score ${result.score}`).toBe("F");
	});

	it("poor grades F", async () => {
		const result = await auditSite("poor");
		expect(result.grade, `score ${result.score}`).toBe("F");
	});
});
