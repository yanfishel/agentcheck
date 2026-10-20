import { getDb } from "../../../../../server/current-user";
import { handleSharedScreenshot } from "../../../../../server/screenshot";

export async function GET(
	request: Request,
	context: { params: Promise<{ token: string }> },
): Promise<Response> {
	const { token } = await context.params;
	return handleSharedScreenshot(request, token, { db: getDb() });
}
