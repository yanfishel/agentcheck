import { getDb } from "../../../../../server/current-user";
import { handleSharedExport } from "../../../../../server/export";

export async function GET(
	request: Request,
	context: { params: Promise<{ token: string }> },
): Promise<Response> {
	const { token } = await context.params;
	return handleSharedExport(request, token, { db: getDb() });
}
