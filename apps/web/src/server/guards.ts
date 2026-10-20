import "server-only";
import type { SyncedUser } from "@agentcheck/db";
import { notFound } from "next/navigation";
import { getCurrentUser } from "./current-user";

type GetUser = () => Promise<SyncedUser | null>;

/**
 * Returns the admin, or renders a 404 for everyone else (signed-in non-admins,
 * blocked admins). Authorization comes only from the database role, which is
 * recomputed from ADMIN_EMAIL on every request; never from session claims.
 */
export async function requireAdmin(
	getUser: GetUser = () => getCurrentUser(),
): Promise<SyncedUser> {
	const user = await getUser();
	if (user?.role !== "admin" || user.blocked) notFound();
	return user;
}

/** Returns the signed-in, non-blocked user, or renders a 404. */
export async function requireActiveUser(
	getUser: GetUser = () => getCurrentUser(),
): Promise<SyncedUser> {
	const user = await getUser();
	if (!user || user.blocked) notFound();
	return user;
}
