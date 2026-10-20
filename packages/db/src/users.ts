import { count, desc, eq, ilike } from "drizzle-orm";
import type { Db } from "./client.ts";
import { containsPattern } from "./like.ts";
import { audits, type Role, type User, users } from "./schema.ts";

/** Plain identity built by the web app from a Clerk user (no Clerk import here). */
export interface ClerkIdentity {
	id: string;
	primaryEmail: string | null;
	primaryEmailVerified: boolean;
}

export interface SyncedUser {
	id: string;
	email: string;
	role: Role;
	blocked: boolean;
	created: boolean;
}

const isAscii = (value: string) => {
	for (let i = 0; i < value.length; i++) {
		if (value.charCodeAt(i) > 0x7f) return false;
	}
	return true;
};

/**
 * Admin email comparison: ASCII-only case folding. If either side has
 * non-ASCII characters it must match exactly, so Unicode case mappings
 * (e.g. the Kelvin sign) can never create a match.
 */
function sameEmail(a: string, b: string): boolean {
	const x = a.trim();
	const y = b.trim();
	if (!isAscii(x) || !isAscii(y)) return x === y;
	return x.toLowerCase() === y.toLowerCase();
}

/**
 * Upserts the local user for a Clerk identity. The role is recomputed on every
 * sync: `admin` iff the verified primary email equals `adminEmail`
 * (ASCII case-insensitive), otherwise `user`. There is no first-user fallback.
 */
export async function syncUser(
	db: Db,
	identity: ClerkIdentity,
	opts: { adminEmail: string },
): Promise<SyncedUser> {
	const adminEmail = opts.adminEmail?.trim();
	if (!adminEmail) throw new Error("ADMIN_EMAIL is required");
	const email = identity.primaryEmail ?? "";
	const role: Role =
		identity.primaryEmailVerified &&
		email !== "" &&
		sameEmail(email, adminEmail)
			? "admin"
			: "user";

	const [existing] = await db
		.select()
		.from(users)
		.where(eq(users.id, identity.id))
		.limit(1);
	if (existing) {
		const nextEmail = email || existing.email;
		if (existing.email !== nextEmail || existing.role !== role) {
			await db
				.update(users)
				.set({ email: nextEmail, role })
				.where(eq(users.id, identity.id));
		}
		return {
			id: existing.id,
			email: nextEmail,
			role,
			blocked: existing.blocked,
			created: false,
		};
	}
	await db
		.insert(users)
		.values({ id: identity.id, email, role })
		.onConflictDoUpdate({ target: users.id, set: { email, role } });
	return { id: identity.id, email, role, blocked: false, created: true };
}

/** A substring of the email, matched case-insensitively and literally. */
const emailLike = (search?: string) =>
	search ? ilike(users.email, containsPattern(search)) : undefined;

/** Users, newest first (default limit 100), optionally by email. */
export async function listUsers(
	db: Db,
	opts: { search?: string; limit?: number; offset?: number } = {},
): Promise<User[]> {
	return db
		.select()
		.from(users)
		.where(emailLike(opts.search))
		.orderBy(desc(users.createdAt))
		.limit(opts.limit ?? 100)
		.offset(opts.offset ?? 0);
}

export async function countUsers(
	db: Db,
	opts: { search?: string } = {},
): Promise<number> {
	const [row] = await db
		.select({ total: count() })
		.from(users)
		.where(emailLike(opts.search));
	return row?.total ?? 0;
}

/** One user by id, or `null` when there is no such row. */
export async function getUserById(db: Db, id: string): Promise<User | null> {
	const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return row ?? null;
}

/** Sets the blocked flag; returns the updated row, or `null` for an unknown id. */
export async function setUserBlocked(
	db: Db,
	id: string,
	blocked: boolean,
): Promise<User | null> {
	const [row] = await db
		.update(users)
		.set({ blocked })
		.where(eq(users.id, id))
		.returning();
	return row ?? null;
}

/**
 * Deletes a user and every audit they own, in one transaction (the Clerk
 * user.deleted webhook). Anonymous audits and other users are untouched.
 * Idempotent: an unknown id deletes nothing, so a redelivered event is harmless.
 */
export async function deleteUserData(
	db: Db,
	id: string,
): Promise<{ user: boolean; audits: number }> {
	return db.transaction(async (tx) => {
		const removed = await tx
			.delete(audits)
			.where(eq(audits.userId, id))
			.returning({ id: audits.id });
		const [user] = await tx
			.delete(users)
			.where(eq(users.id, id))
			.returning({ id: users.id });
		return { user: Boolean(user), audits: removed.length };
	});
}
