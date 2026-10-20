import { auth } from "@clerk/nextjs/server";
import { handleSetBlocked } from "../../../../../server/admin";
import { getDb } from "../../../../../server/current-user";
import { requireAdmin } from "../../../../../server/guards";

export async function PATCH(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	await auth.protect();
	const { id } = await context.params;
	return handleSetBlocked(request, id, {
		db: getDb(),
		admin: () => requireAdmin(),
	});
}
