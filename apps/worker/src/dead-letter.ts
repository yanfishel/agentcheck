import { parseAuditJobData } from "@agentcheck/db";
import type { AuditStore } from "./audit-store.ts";
import type { Logger } from "./log.ts";
import { INTERNAL_ERROR } from "./process-audit.ts";

const noLog: Logger = () => {};

/**
 * Handles an audit job that exhausted its retries: marks the audit failed so
 * it does not stay `running`. Finished audits are left unchanged.
 */
export async function runDeadLetter(
	deps: { store: Pick<AuditStore, "fail">; log?: Logger },
	data: unknown,
): Promise<boolean> {
	const { auditId } = parseAuditJobData(data);
	const failed = await deps.store.fail(auditId, INTERNAL_ERROR);
	(deps.log ?? noLog)("warn", "audit.dead_letter", { auditId, failed });
	return failed;
}
