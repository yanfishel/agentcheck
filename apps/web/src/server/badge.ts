import "server-only";
import { type Db, getAuditByShareToken } from "@agentcheck/db";
import { renderBadge } from "./render-badge";

export { renderBadge };

export interface BadgeDeps {
	db: Db;
}

/** The badge for a shared done audit; 404 for anything else. */
export async function handleBadge(
	token: string,
	deps: BadgeDeps,
): Promise<Response> {
	const audit = await getAuditByShareToken(deps.db, token);
	const score = audit?.score ?? audit?.result?.score;
	if (!audit || typeof score !== "number") {
		return new Response("Not found", {
			status: 404,
			headers: { "cache-control": "no-store" },
		});
	}
	const grade = audit.grade ?? audit.result?.grade ?? "";
	return new Response(renderBadge({ score, grade }), {
		headers: {
			"content-type": "image/svg+xml; charset=utf-8",
			"cache-control": "public, max-age=86400",
		},
	});
}
