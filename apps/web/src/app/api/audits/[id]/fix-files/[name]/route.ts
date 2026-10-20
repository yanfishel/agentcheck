import { getAudit } from "@agentcheck/db";
import { notFound } from "next/navigation";
import {
	currentViewer,
	requireAuditAccess,
} from "../../../../../../server/audit-access";
import { getDb } from "../../../../../../server/current-user";
import { handleFixFileDownload } from "../../../../../../server/fix-files";
import { getQueue } from "../../../../../../server/queue";
import { publicOrigin } from "../../../../../../server/share";

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string; name: string }> },
): Promise<Response> {
	const { id, name } = await context.params;
	const db = getDb();
	const audit = await getAudit(db, id);
	if (!audit) notFound();
	requireAuditAccess(audit, await currentViewer(audit));
	return handleFixFileDownload(id, name, {
		db,
		boss: async () => (await getQueue()).boss,
		viewer: currentViewer,
		origin: publicOrigin(request.headers),
	});
}
