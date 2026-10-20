import { getAudit, getAuditScreenshot } from "@agentcheck/db";
import { notFound } from "next/navigation";
import {
	currentViewer,
	requireAuditAccess,
} from "../../../../../server/audit-access";
import { getDb } from "../../../../../server/current-user";
import {
	screenshotResponse,
	screenshotSize,
} from "../../../../../server/screenshot";

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const db = getDb();
	const audit = await getAudit(db, id);
	if (!audit) notFound();
	requireAuditAccess(audit, await currentViewer(audit));
	return screenshotResponse(
		await getAuditScreenshot(db, id, screenshotSize(request)),
		"private",
	);
}
