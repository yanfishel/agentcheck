import "server-only";
import {
	createDb,
	type Db,
	type DbHandle,
	type Role,
	type SyncedUser,
	syncUser,
} from "@agentcheck/db";
import { cache } from "react";
import { requireAdminEmail } from "./env";

export interface ClerkUserLike {
	id: string;
	primaryEmail: string | null;
	primaryEmailVerified: boolean;
	publicMetadata: Record<string, unknown>;
}

export interface ClerkPort {
	currentUser(): Promise<ClerkUserLike | null>;
	setRole(userId: string, role: Role): Promise<void>;
}

declare global {
	var __agentcheckDb: DbHandle | undefined;
}

/**
 * One shared connection pool per server process (lazy). The handle lives on
 * `globalThis` so Next dev hot reloads do not leak a new `pg` pool each time.
 */
function sharedDb(): Db {
	if (!globalThis.__agentcheckDb) {
		const url = process.env.DATABASE_URL;
		if (!url) {
			throw new Error(
				"DATABASE_URL is not set; it is required to look up the current user.",
			);
		}
		globalThis.__agentcheckDb = createDb(url);
	}
	return globalThis.__agentcheckDb.db;
}

const clerkPort: ClerkPort = {
	async currentUser() {
		const { currentUser } = await import("@clerk/nextjs/server");
		const user = await currentUser();
		if (!user) return null;
		const email = user.primaryEmailAddress;
		return {
			id: user.id,
			primaryEmail: email?.emailAddress ?? null,
			primaryEmailVerified: email?.verification?.status === "verified",
			publicMetadata: user.publicMetadata,
		};
	},
	async setRole(userId, role) {
		const { clerkClient } = await import("@clerk/nextjs/server");
		const client = await clerkClient();
		await client.users.updateUserMetadata(userId, { publicMetadata: { role } });
	},
};

async function loadCurrentUser(
	deps: { db?: Db; clerk?: ClerkPort; adminEmail?: string } = {},
): Promise<SyncedUser | null> {
	const adminEmail = deps.adminEmail ?? requireAdminEmail();
	const clerk = deps.clerk ?? clerkPort;
	const clerkUser = await clerk.currentUser();
	if (!clerkUser) return null;
	const db = deps.db ?? sharedDb();
	const user = await syncUser(db, clerkUser, { adminEmail });
	if (clerkUser.publicMetadata.role !== user.role) {
		try {
			await clerk.setRole(user.id, user.role);
		} catch (error) {
			// Best-effort mirror: the database is authoritative; retried next request.
			console.warn(
				"Could not mirror the user role to Clerk:",
				error instanceof Error ? error.name : "unknown error",
			);
		}
	}
	return user;
}

/**
 * Per-request memoized (React `cache`) when called without arguments, as
 * server components do; calls with a `deps` object are never shared.
 */
export const getCurrentUser = cache(loadCurrentUser);

/** The shared database, for server components that list data. */
export function getDb(): Db {
	return sharedDb();
}
