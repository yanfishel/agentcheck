import { auth } from "@clerk/nextjs/server";
import { handleUpdateLimits } from "../../../../server/admin";
import { getDb } from "../../../../server/current-user";
import { requireAdmin } from "../../../../server/guards";

export async function PUT(request: Request): Promise<Response> {
	await auth.protect();
	return handleUpdateLimits(request, {
		db: getDb(),
		admin: () => requireAdmin(),
	});
}
