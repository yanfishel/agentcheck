import { getDb } from "../../../../../server/current-user";
import { handleOgImage } from "../../../../../server/og-image";

export async function GET(
	_request: Request,
	context: { params: Promise<{ token: string }> },
): Promise<Response> {
	const { token } = await context.params;
	return handleOgImage(token, { db: getDb() });
}
