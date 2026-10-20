import "server-only";
import {
	type Db,
	getAuditByShareToken,
	getAuditScreenshot,
} from "@agentcheck/db";

export type ScreenshotSize = "small" | "large";

export interface ScreenshotDeps {
	db: Db;
}

/** The `size` query parameter: `large` only when asked, `small` otherwise. */
export function screenshotSize(request: Request): ScreenshotSize {
	return new URL(request.url).searchParams.get("size") === "large"
		? "large"
		: "small";
}

/** The stored image, or a 404 that is never cached. */
export function screenshotResponse(
	shot: { contentType: string; body: Uint8Array } | null,
	cache: "private" | "shared",
): Response {
	if (!shot) {
		return new Response("Not found", {
			status: 404,
			headers: { "cache-control": "no-store" },
		});
	}
	return new Response(shot.body as BodyInit, {
		headers: {
			"content-type": shot.contentType,
			"x-content-type-options": "nosniff",
			"cache-control":
				cache === "private" ? "private, max-age=3600" : "public, max-age=300",
		},
	});
}

/** The screenshot of a shared audit; the token is the capability, 404 otherwise. */
export async function handleSharedScreenshot(
	request: Request,
	token: string,
	deps: ScreenshotDeps,
): Promise<Response> {
	const audit = await getAuditByShareToken(deps.db, token);
	if (!audit) return screenshotResponse(null, "shared");
	return screenshotResponse(
		await getAuditScreenshot(deps.db, audit.id, screenshotSize(request)),
		"shared",
	);
}
