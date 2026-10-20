import { handleBadge } from "../../../../../server/badge";
import { getDb } from "../../../../../server/current-user";

export async function GET(
	_request: Request,
	context: { params: Promise<{ token: string }> },
): Promise<Response> {
	const { token } = await context.params;
	return handleBadge(token, { db: getDb() });
}
