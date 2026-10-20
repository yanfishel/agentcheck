import { getAudit } from "@agentcheck/db";
import { notFound } from "next/navigation";
import {
	auditStatusBody,
	currentViewer,
	requireAuditAccess,
} from "../../../../server/audit-access";
import { getDb } from "../../../../server/current-user";

export async function GET(
	_request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const audit = await getAudit(getDb(), id);
	if (!audit) notFound();
	requireAuditAccess(audit, await currentViewer(audit));
	return Response.json(auditStatusBody(audit), {
		headers: { "cache-control": "no-store" },
	});
}
