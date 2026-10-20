import "server-only";
import { randomBytes } from "node:crypto";
import { type Audit, type Db, getAudit, setShareToken } from "@agentcheck/db";
import { canViewAudit, type Viewer } from "./audit-access";
import { publicBaseUrl } from "./env";

export interface ShareDeps {
	db: Db;
	viewer: (audit: Pick<Audit, "userId">) => Promise<Viewer>;
}

type Env = Record<string, string | undefined>;

/** A 144-bit URL-safe token: 24 base64url characters. */
export function newShareToken(): string {
	return randomBytes(18).toString("base64url");
}

function sharePath(base: string, token: string): string {
	return `${base}/r/${token}`;
}

/** The public link for a token; see `publicOrigin`. */
export function shareUrl(
	token: string,
	request: Request,
	env: Env = process.env,
): string {
	return sharePath(
		publicOrigin(request.headers, env, new URL(request.url).origin),
		token,
	);
}

/**
 * The one origin every public link (share link, badge, README report link) is
 * built from: `PUBLIC_BASE_URL`. Production never derives it from the request,
 * whose Host and X-Forwarded-Host a client controls; outside production the
 * request host (or `fallback`) stands in so local links work.
 */
export function publicOrigin(
	headers: Pick<Headers, "get">,
	env: Env = process.env,
	fallback?: string,
): string {
	const base = publicBaseUrl(env);
	if (base) return base;
	if (env.NODE_ENV === "production") {
		throw new Error("PUBLIC_BASE_URL is not set");
	}
	const host = headers.get("x-forwarded-host") ?? headers.get("host");
	if (!host && fallback) return fallback;
	const proto =
		headers.get("x-forwarded-proto") ??
		(host?.startsWith("localhost") ? "http" : "https");
	return `${proto}://${host ?? "localhost"}`;
}

/** Same rule as `shareUrl`, for server components that only have request headers. */
export function shareUrlFromHeaders(
	token: string,
	headers: Pick<Headers, "get">,
	env: Env = process.env,
): string {
	return sharePath(publicOrigin(headers, env), token);
}

type Checked = { audit: Audit } | { response: Response };

/** Access first (404), then ownership (403), then status (409). */
async function checkShareable(id: string, deps: ShareDeps): Promise<Checked> {
	const audit = await getAudit(deps.db, id);
	const viewer = audit ? await deps.viewer(audit) : null;
	if (!audit || !canViewAudit(audit, viewer)) {
		return { response: Response.json({ error: "Not found" }, { status: 404 }) };
	}
	if (!viewer || viewer.id !== audit.userId) {
		return {
			response: Response.json(
				{ error: "Only the owner can share this audit" },
				{ status: 403 },
			),
		};
	}
	if (audit.status !== "done") {
		return {
			response: Response.json(
				{ error: "Only finished audits can be shared" },
				{ status: 409 },
			),
		};
	}
	return { audit };
}

export async function handleShare(
	request: Request,
	id: string,
	deps: ShareDeps,
): Promise<Response> {
	const checked = await checkShareable(id, deps);
	if ("response" in checked) return checked.response;
	const { audit } = checked;
	let token = audit.shareToken;
	if (!token && audit.userId) {
		const updated = await setShareToken(
			deps.db,
			id,
			audit.userId,
			newShareToken(),
		);
		token = updated?.shareToken ?? null;
	}
	if (!token) return Response.json({ error: "Not found" }, { status: 404 });
	return Response.json(
		{ shareToken: token, url: shareUrl(token, request) },
		{ headers: { "cache-control": "no-store" } },
	);
}

export async function handleUnshare(
	_request: Request,
	id: string,
	deps: ShareDeps,
): Promise<Response> {
	const checked = await checkShareable(id, deps);
	if ("response" in checked) return checked.response;
	const { audit } = checked;
	if (audit.shareToken && audit.userId) {
		await setShareToken(deps.db, id, audit.userId, null);
	}
	return new Response(null, { status: 204 });
}
