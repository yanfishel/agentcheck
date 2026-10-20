import { getAudit } from "@agentcheck/db";
import { notFound } from "next/navigation";
import {
	currentViewer,
	requireAuditAccess,
} from "../../../../../server/audit-access";
import { getDb } from "../../../../../server/current-user";
import {
	handleGetFixFiles,
	handleStartFixFiles,
} from "../../../../../server/fix-files";
import { getQueue } from "../../../../../server/queue";
import { publicOrigin } from "../../../../../server/share";

/** Access first (404 for anyone who cannot see the audit); the handlers check ownership. */
async function guardedDeps(id: string, request: Request) {
	const db = getDb();
	const audit = await getAudit(db, id);
	if (!audit) notFound();
	requireAuditAccess(audit, await currentViewer(audit));
	return {
		db,
		boss: async () => (await getQueue()).boss,
		viewer: currentViewer,
		origin: publicOrigin(request.headers),
	};
}

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	return handleGetFixFiles(id, await guardedDeps(id, request));
}

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	return handleStartFixFiles(id, await guardedDeps(id, request));
}
