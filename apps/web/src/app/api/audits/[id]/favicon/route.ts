import { getAudit, getAuditFavicon } from "@agentcheck/db";
import { notFound } from "next/navigation";
import {
	currentViewer,
	requireAuditAccess,
} from "../../../../../server/audit-access";
import { getDb } from "../../../../../server/current-user";
import { faviconResponse } from "../../../../../server/favicon";

export async function GET(
	_request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const db = getDb();
	const audit = await getAudit(db, id);
	if (!audit) notFound();
	requireAuditAccess(audit, await currentViewer(audit));
	return faviconResponse(await getAuditFavicon(db, id), "private");
}
