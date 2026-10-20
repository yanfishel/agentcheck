import "server-only";
import {
	type Db,
	getUserById,
	type SyncedUser,
	setUserBlocked,
	updateSettings,
	validateLimits,
} from "@agentcheck/db";

export interface AdminDeps {
	db: Db;
	/** `requireAdmin` in the route: throws `notFound()` for everyone but the admin. */
	admin: () => Promise<SyncedUser>;
}

const BAD_BODY = "Expected JSON with blocked (true or false)";

/** PATCH /api/admin/users/[id]: blocks or unblocks a non-admin user. */
export async function handleSetBlocked(
	request: Request,
	id: string,
	deps: AdminDeps,
): Promise<Response> {
	await deps.admin();
	const body: unknown = await request.json().catch(() => null);
	const blocked =
		typeof body === "object" && body !== null && !Array.isArray(body)
			? (body as { blocked?: unknown }).blocked
			: undefined;
	if (typeof blocked !== "boolean") {
		return Response.json({ error: BAD_BODY }, { status: 400 });
	}
	const target = await getUserById(deps.db, id);
	if (!target)
		return Response.json({ error: "User not found" }, { status: 404 });
	if (target.role === "admin") {
		return Response.json(
			{ error: "Admins cannot be blocked" },
			{ status: 409 },
		);
	}
	const updated = await setUserBlocked(deps.db, id, blocked);
	if (!updated)
		return Response.json({ error: "User not found" }, { status: 404 });
	return Response.json({ id: updated.id, blocked: updated.blocked });
}

/** PUT /api/admin/settings: validates and stores the rate limits. */
export async function handleUpdateLimits(
	request: Request,
	deps: AdminDeps,
): Promise<Response> {
	await deps.admin();
	const body: unknown = await request.json().catch(() => null);
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return Response.json({ error: "Expected a JSON object" }, { status: 400 });
	}
	let limits: ReturnType<typeof validateLimits>;
	try {
		limits = validateLimits(body);
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "Invalid limits" },
			{ status: 400 },
		);
	}
	return Response.json(await updateSettings(deps.db, limits));
}
