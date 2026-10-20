import { currentViewer } from "../../../../../server/audit-access";
import { getDb } from "../../../../../server/current-user";
import { handleShare, handleUnshare } from "../../../../../server/share";

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	return handleShare(request, id, { db: getDb(), viewer: currentViewer });
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	return handleUnshare(request, id, { db: getDb(), viewer: currentViewer });
}
