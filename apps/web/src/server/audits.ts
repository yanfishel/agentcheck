import "server-only";
import {
	type Audit,
	type AuditMode,
	createAudit,
	type Db,
	enforceLimits,
	enqueueAudit,
	type LimitSettings,
	type PgBoss,
	RateLimitError,
	type Role,
	type SyncedUser,
} from "@agentcheck/db";
import { normaliseTargetUrl } from "./target-url";

export interface StartAuditInput {
	url: string;
	mode: AuditMode;
	userId: string | null;
	role: Role | null;
	ipHash: string | null;
}

export interface StartAuditDeps {
	db: Db;
	boss: PgBoss;
	limits: () => Promise<LimitSettings>;
}

export interface StartAuditRequestDeps extends StartAuditDeps {
	viewer: () => Promise<{ userId: string | null; user: SyncedUser | null }>;
	ipHash: string | null;
}

/** The target URL was refused; `message` is safe to show to the user. */
export class TargetUrlError extends Error {
	override name = "TargetUrlError";
}

/**
 * Validates the raw URL and stores a queued audit together with its job, in
 * one transaction. Throws `TargetUrlError` when the URL is refused.
 */
export async function startAudit(
	deps: StartAuditDeps,
	input: StartAuditInput,
): Promise<Audit> {
	const target = normaliseTargetUrl(input.url);
	if (!target.ok) throw new TargetUrlError(target.message);
	const limits = await deps.limits();
	return createAudit(
		deps.db,
		{
			url: target.url,
			host: target.host,
			mode: input.mode,
			userId: input.userId,
			ipHash: input.ipHash,
		},
		(tx, audit) => enqueueAudit(deps.boss, tx, audit),
		(tx) =>
			enforceLimits(tx, limits, {
				userId: input.userId,
				role: input.role,
				ipHash: input.ipHash,
				host: target.host,
				mode: input.mode,
			}),
	);
}

const BAD_BODY = "Expected JSON with url and mode (quick or full)";

async function parseBody(
	request: Request,
): Promise<{ url: string; mode: AuditMode } | null> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return null;
	}
	if (typeof body !== "object" || body === null) return null;
	const { url, mode } = body as Record<string, unknown>;
	if (typeof url !== "string") return null;
	if (mode !== "quick" && mode !== "full") return null;
	return { url, mode };
}

const error = (message: string, status: number) =>
	Response.json({ error: message }, { status });

/**
 * `POST /api/audits`: anonymous visitors may start quick audits; full audits
 * need a signed-in, non-blocked user.
 */
export async function handleStartAudit(
	request: Request,
	deps: StartAuditRequestDeps,
): Promise<Response> {
	const body = await parseBody(request);
	if (!body) return error(BAD_BODY, 400);
	const { userId, user } = await deps.viewer();
	if (body.mode === "full" && !userId) {
		return error("Sign in to run a full check", 401);
	}
	if (userId && !user) return error("Your account is not available", 403);
	if (userId && user?.blocked) return error("Your account is blocked", 403);
	try {
		const audit = await startAudit(deps, {
			url: body.url,
			mode: body.mode,
			userId,
			role: user?.role ?? null,
			ipHash: deps.ipHash,
		});
		return Response.json({ id: audit.id, status: "queued" }, { status: 201 });
	} catch (cause) {
		if (cause instanceof RateLimitError) {
			return Response.json(
				{ error: cause.message, retryAfterSeconds: cause.retryAfterSeconds },
				{
					status: 429,
					headers: { "Retry-After": String(cause.retryAfterSeconds) },
				},
			);
		}
		if (cause instanceof TargetUrlError) return error(cause.message, 400);
		throw cause;
	}
}
