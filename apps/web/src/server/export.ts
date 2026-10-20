import "server-only";
import { renderHtml } from "@agentcheck/core";
import { type Audit, type Db, getAuditByShareToken } from "@agentcheck/db";

export type ExportFormat = "json" | "html";

const NO_STORE = { "cache-control": "no-store" };

/** A "not found" that no cache may keep (the audit may be shared or finished a moment later). */
const notFound = () =>
	new Response("Not found", { status: 404, headers: NO_STORE });

export interface ExportDeps {
	db: Db;
}

/** `agentcheck-<host>-<yyyy-mm-dd>.<ext>`; the host keeps only [a-z0-9.-]. */
export function exportFilename(
	host: string,
	finishedAt: Date,
	ext: ExportFormat,
): string {
	const safeHost = host.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
	const date = finishedAt.toISOString().slice(0, 10);
	return `agentcheck-${safeHost}-${date}.${ext}`;
}

/** The `format` query parameter: json by default, null when unsupported. */
export function exportFormat(request: Request): ExportFormat | null {
	const value = new URL(request.url).searchParams.get("format") ?? "json";
	return value === "json" || value === "html" ? value : null;
}

/** The download for a done audit; 400 for a bad format, 404 without a result. */
export function exportResponse(
	audit: Audit,
	format: ExportFormat | null,
): Response {
	if (format === null) {
		return Response.json(
			{ error: "format must be json or html" },
			{ status: 400, headers: NO_STORE },
		);
	}
	if (audit.status !== "done" || !audit.result) return notFound();
	const filename = exportFilename(
		audit.host,
		audit.finishedAt ?? audit.createdAt,
		format,
	);
	const headers = {
		"content-disposition": `attachment; filename="${filename}"`,
		...NO_STORE,
	};
	if (format === "html") {
		return new Response(renderHtml(audit.result), {
			headers: { ...headers, "content-type": "text/html; charset=utf-8" },
		});
	}
	return new Response(JSON.stringify(audit.result), {
		headers: { ...headers, "content-type": "application/json" },
	});
}

/** The export of a shared audit; the token is the capability, 404 otherwise. */
export async function handleSharedExport(
	request: Request,
	token: string,
	deps: ExportDeps,
): Promise<Response> {
	const audit = await getAuditByShareToken(deps.db, token);
	if (!audit) return notFound();
	return exportResponse(audit, exportFormat(request));
}
