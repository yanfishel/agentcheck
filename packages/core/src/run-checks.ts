import type { FinishedCheck } from "./progress.ts";
import type { AuditContext, Check } from "./types.ts";

/** Runs every check on one page; a crashing check fails instead of failing the audit. */
export async function runChecks(
	ctx: AuditContext,
	checks: Check[],
	onCheck?: (check: FinishedCheck) => void,
): Promise<FinishedCheck[]> {
	return Promise.all(
		checks.map(async (check): Promise<FinishedCheck> => {
			const base = {
				id: check.id,
				title: check.title,
				weight: check.weight,
				category: check.category,
			};
			let result: FinishedCheck;
			try {
				result = { ...base, ...(await check.run(ctx)) };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				result = {
					...base,
					status: "fail",
					message: `Check crashed: ${message}`,
					remediation: "This is a bug in AgentCheck; please report it.",
				};
			}
			try {
				onCheck?.(result);
			} catch {
				// A failing consumer never affects the audit.
			}
			return result;
		}),
	);
}
