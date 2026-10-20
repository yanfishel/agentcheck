import "server-only";
import { type Db, getAuditByShareToken, getAuditFavicon } from "@agentcheck/db";
import { screenshotResponse } from "./screenshot";

export interface FaviconDeps {
	db: Db;
}

/** Stored icons are untrusted bytes: the CSP stops scripts and subresources in a directly opened SVG. */
const FAVICON_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/** The stored icon, or a 404 that is never cached; both carry the sandboxing CSP. */
export function faviconResponse(
	icon: { contentType: string; body: Uint8Array } | null,
	cache: "private" | "shared",
): Response {
	const res = screenshotResponse(icon, cache);
	res.headers.set("content-security-policy", FAVICON_CSP);
	return res;
}

/** The icon of a shared audit; the token is the capability, 404 otherwise. */
export async function handleSharedFavicon(
	_request: Request,
	token: string,
	deps: FaviconDeps,
): Promise<Response> {
	const audit = await getAuditByShareToken(deps.db, token);
	if (!audit) return faviconResponse(null, "shared");
	return faviconResponse(await getAuditFavicon(deps.db, audit.id), "shared");
}
