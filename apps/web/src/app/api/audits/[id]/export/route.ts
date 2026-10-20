import { getAudit } from "@agentcheck/db";
import { notFound } from "next/navigation";
import {
	currentViewer,
	requireAuditAccess,
} from "../../../../../server/audit-access";
import { getDb } from "../../../../../server/current-user";
import { exportFormat, exportResponse } from "../../../../../server/export";

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const audit = await getAudit(getDb(), id);
	if (!audit) notFound();
	requireAuditAccess(audit, await currentViewer(audit));
	return exportResponse(audit, exportFormat(request));
}
