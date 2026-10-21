import "server-only";
import type { AuditResult } from "@agentcheck/core";
import {
	type FixKind,
	fixKindsFor,
	fixKindsSettled,
} from "@agentcheck/core/fixes";
import { completeCategories } from "@agentcheck/core/progress";
import {
	type Audit,
	type AuditMode,
	type AuditStatus,
	getUserById,
	type SyncedUser,
	type User,
} from "@agentcheck/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "./current-user";

/** The person looking at an audit; `null` when signed out. */
export type Viewer = SyncedUser | null;

/**
 * Anonymous audits are visible to everyone (their id is the capability).
 * Owned audits are visible only to their active owner or an active admin.
 */
export function canViewAudit(
	audit: Pick<Audit, "userId">,
	viewer: Viewer,
): boolean {
	if (audit.userId === null) return true;
	if (viewer === null) return false;
	if (viewer.blocked) return false;
	if (viewer.id === audit.userId) return true;
	return viewer.role === "admin";
}

/**
 * Renders a 404 when the viewer may not see the audit, so a forbidden audit
 * is indistinguishable from an unknown one.
 */
export function requireAuditAccess(
	audit: Pick<Audit, "userId">,
	viewer: Viewer,
): void {
	if (!canViewAudit(audit, viewer)) notFound();
}

/** What a running audit has produced so far: only whole categories, never raw checks. */
export interface AuditProgressData {
	categories: AuditResult["categories"];
	hasFavicon: boolean;
	fixKinds: FixKind[];
	/** Every check that decides a fix kind is in, so `fixKinds` can no longer grow. */
	fixKindsSettled: boolean;
}

/** The public status of an audit, as returned by `GET /api/audits/[id]`. */
export interface AuditStatusBody {
	id: string;
	status: AuditStatus;
	mode: AuditMode;
	url: string;
	score: number | null;
	grade: string | null;
	error: string | null;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
	/** Set only while the audit is running. */
	progress: AuditProgressData | null;
}

function progressOf(audit: Audit): AuditProgressData | null {
	if (audit.status !== "running") return null;
	const categories = completeCategories(Object.values(audit.partial ?? {}));
	return {
		categories,
		hasFavicon: audit.hasFavicon,
		fixKinds: fixKindsFor({ categories }),
		fixKindsSettled: fixKindsSettled(categories),
	};
}

/** Picks the public fields; never the result, ip hash, share token or owner. */
export function auditStatusBody(audit: Audit): AuditStatusBody {
	return {
		id: audit.id,
		status: audit.status,
		mode: audit.mode,
		url: audit.url,
		score: audit.score,
		grade: audit.grade,
		error: audit.error,
		createdAt: audit.createdAt.toISOString(),
		startedAt: audit.startedAt?.toISOString() ?? null,
		finishedAt: audit.finishedAt?.toISOString() ?? null,
		progress: progressOf(audit),
	};
}

export interface ViewerDeps {
	userId: () => Promise<string | null>;
	getUser: (id: string) => Promise<User | null>;
}

/**
 * Resolves the viewer of an audit with as little work as possible: anonymous
 * audits need no viewer at all, and owned ones need only the session user id
 * (a JWT check) plus one `users` row read, never a Clerk Backend API call.
 */
export async function resolveViewer(
	audit: Pick<Audit, "userId">,
	deps: ViewerDeps,
): Promise<Viewer> {
	if (audit.userId === null) return null;
	const id = await deps.userId();
	if (!id) return null;
	const row = await deps.getUser(id);
	if (!row) return null;
	return {
		id: row.id,
		email: row.email,
		role: row.role,
		blocked: row.blocked,
		created: false,
	};
}

/** Keyed on the owner id (a primitive): `cache` compares arguments by identity, so distinct audit objects would miss. */
const viewerOf = cache(
	(userId: string | null): Promise<Viewer> =>
		resolveViewer(
			{ userId },
			{
				async userId() {
					const { auth } = await import("@clerk/nextjs/server");
					return (await auth()).userId;
				},
				getUser: (id) => getUserById(getDb(), id),
			},
		),
);

/** The viewer of an audit, memoized per request by the audit's owner id (React `cache`). */
export const currentViewer = (audit: Pick<Audit, "userId">): Promise<Viewer> =>
	viewerOf(audit.userId);
