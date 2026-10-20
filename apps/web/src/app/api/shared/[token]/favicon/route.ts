import { getDb } from "../../../../../server/current-user";
import { handleSharedFavicon } from "../../../../../server/favicon";

export async function GET(
	request: Request,
	context: { params: Promise<{ token: string }> },
): Promise<Response> {
	const { token } = await context.params;
	return handleSharedFavicon(request, token, { db: getDb() });
}
