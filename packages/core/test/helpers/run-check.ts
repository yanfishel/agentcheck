import type { MockAgent } from "undici";
import { expect } from "vitest";
import type { BrowserRenderer } from "../../src/browser/types.ts";
import { createAuditContext } from "../../src/context.ts";
import { createFetcher } from "../../src/http.ts";
import type { Check, CheckOutcome } from "../../src/types.ts";

/** Runs a check against a real context built on a mock agent. */
export async function runCheck(
	check: Check,
	agent: MockAgent,
	target: string,
	renderer?: BrowserRenderer,
): Promise<CheckOutcome> {
	const fetcher = createFetcher({
		userAgent: "agentcheck-test",
		dispatcher: agent,
	});
	const ctx = await createAuditContext(target, fetcher, renderer);
	const outcome = await check.run(ctx);
	if (outcome.status === "warn" || outcome.status === "fail") {
		expect(outcome.remediation?.trim(), "remediation").toBeTruthy();
	}
	return outcome;
}
