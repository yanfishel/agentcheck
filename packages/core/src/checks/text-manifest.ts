import { type HttpResult, isTextResource } from "../http.ts";
import type { AuditContext, CheckOutcome } from "../types.ts";

/** Fetches a manifest path and reports presence as a pass or an explained fail. */
export async function checkTextManifest(
	ctx: AuditContext,
	path: string,
	remediation: string,
): Promise<CheckOutcome> {
	const res = await ctx.get(path);
	if (isTextResource(res)) {
		return { status: "pass", message: `${path} is published` };
	}
	return {
		status: "fail",
		message: `${path} ${describeProblem(res)}`,
		remediation,
	};
}

export function describeProblem(res: HttpResult): string {
	if (res.kind === "error") return `could not be fetched (${res.error})`;
	if (res.status === 404 || res.status === 410) {
		return `not found (HTTP ${res.status})`;
	}
	if (res.status !== 200) return `returned HTTP ${res.status}`;
	if (res.body.trim() === "") return "is empty";
	return "is served as HTML, not plain text";
}
