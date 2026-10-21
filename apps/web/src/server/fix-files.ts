import "server-only";
import type { AuditResult } from "@agentcheck/core";
import {
	agentPrompt,
	type FixFile,
	type FixFiles,
	type FixKind,
	fixKindsFor,
} from "@agentcheck/core/fixes";
import {
	type Audit,
	type AuditFixFilesRow,
	createFixFiles,
	type Db,
	enqueueFixFiles,
	FIX_FILES_MAX_ATTEMPTS,
	FixFilesConflict,
	type FixFilesStatus,
	getAudit,
	getFixFiles,
	type PgBoss,
} from "@agentcheck/db";
import { previewText } from "../components/report/fix-files/preview";
import { canViewAudit, type Viewer } from "./audit-access";
import { fixZip } from "./fix-files-pack";

export interface FixFilesDeps {
	db: Db;
	boss: () => Promise<PgBoss>;
	viewer: (audit: Pick<Audit, "userId">) => Promise<Viewer>;
	/** Public origin for the report link in the zip README. */
	origin: string;
}

/** A fix file as the report page gets it: `content` is a preview when `previewOf` is set. */
export type FixFilePreview = FixFile & {
	/** The full length of `content` when it was cut to a preview, otherwise null. */
	previewOf: number | null;
};

export type FixFilesPreview = Omit<FixFiles, "files"> & {
	files: FixFilePreview[];
};

export type FixFilesView = {
	status: FixFilesStatus | "none";
	kinds: FixKind[];
	attempts: number;
	progress: { read: number; planned: number } | null;
	error: string | null;
	/** The stored result with each file cut to a preview; the full files are downloads. */
	result: FixFilesPreview | null;
	/** Done with at least one file: the prompt download (`.../fix-files/prompt`) exists. */
	hasPrompt: boolean;
};

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status: number, headers?: HeadersInit) =>
	Response.json(body, { status, headers });
const notFound = () => json({ error: "Not found" }, 404);

function preview(files: FixFiles): FixFilesPreview {
	return {
		...files,
		files: files.files.map((file) => {
			const cut = previewText(file.content);
			return cut === null
				? { ...file, previewOf: null }
				: { ...file, content: cut, previewOf: file.content.length };
		}),
	};
}

/** The audit result, only for a finished audit. */
function finishedResult(audit: Audit): AuditResult | null {
	return audit.status === "done" ? audit.result : null;
}

export function fixFilesView(
	audit: Audit,
	row: AuditFixFilesRow | null,
): FixFilesView {
	const auditResult = finishedResult(audit);
	const result = row?.status === "done" ? row.result : null;
	return {
		status: row?.status ?? "none",
		kinds: row?.kinds ?? (auditResult ? fixKindsFor(auditResult) : []),
		attempts: row?.attempts ?? 0,
		progress:
			row && row.progressRead !== null && row.progressPlanned !== null
				? { read: row.progressRead, planned: row.progressPlanned }
				: null,
		error: row?.error ?? null,
		result: result ? preview(result) : null,
		// No prompt when every file was skipped: there is nothing to hand over.
		hasPrompt: Boolean(result && result.files.length > 0 && auditResult),
	};
}

type Loaded = { audit: Audit; viewer: Viewer } | { response: Response };

async function load(id: string, deps: FixFilesDeps): Promise<Loaded> {
	const audit = await getAudit(deps.db, id);
	const viewer = audit ? await deps.viewer(audit) : null;
	if (!audit || !canViewAudit(audit, viewer)) return { response: notFound() };
	return { audit, viewer };
}

/** Fix files belong to owned audits: visible to the owner and the admin only. */
function canSeeFixFiles(audit: Audit, viewer: Viewer): boolean {
	return audit.userId !== null && viewer !== null;
}

/** 404 access, 403 owner, 409 status or nothing fixable or a conflict, 202 with the view. */
export async function handleStartFixFiles(
	id: string,
	deps: FixFilesDeps,
): Promise<Response> {
	const loaded = await load(id, deps);
	if ("response" in loaded) return loaded.response;
	const { audit, viewer } = loaded;
	if (!viewer || viewer.id !== audit.userId) {
		return json({ error: "Only the owner can generate fix files" }, 403);
	}
	const result = finishedResult(audit);
	if (!result) {
		return json({ error: "Only finished audits can have fix files" }, 409);
	}
	const kinds = fixKindsFor(result);
	if (kinds.length === 0) {
		return json({ error: "Nothing in this audit can be fixed by a file" }, 409);
	}
	try {
		const boss = await deps.boss();
		const row = await createFixFiles(deps.db, id, kinds, (tx) =>
			enqueueFixFiles(boss, tx, id),
		);
		return json(fixFilesView(audit, row), 202, NO_STORE);
	} catch (cause) {
		if (cause instanceof FixFilesConflict) {
			const error =
				cause.reason === "attempts"
					? `Fix files can be generated ${FIX_FILES_MAX_ATTEMPTS} times for one check at most. Run a new check to try again.`
					: cause.reason === "done"
						? "Fix files are already generated"
						: "Fix files are already being generated";
			return json({ error }, 409);
		}
		throw cause;
	}
}

export async function handleGetFixFiles(
	id: string,
	deps: FixFilesDeps,
): Promise<Response> {
	const loaded = await load(id, deps);
	if ("response" in loaded) return loaded.response;
	const { audit, viewer } = loaded;
	if (!canSeeFixFiles(audit, viewer)) return notFound();
	const row = await getFixFiles(deps.db, id);
	return json(fixFilesView(audit, row), 200, NO_STORE);
}

/** A downloadable name: also has to equal the name of a stored file of the audit. */
const FILE_NAME = /^[a-z0-9][a-z0-9._-]*\.(txt|md|html)$/;

export async function handleFixFileDownload(
	id: string,
	name: string,
	deps: FixFilesDeps,
): Promise<Response> {
	const loaded = await load(id, deps);
	if ("response" in loaded) return loaded.response;
	const { audit, viewer } = loaded;
	if (!canSeeFixFiles(audit, viewer)) return notFound();
	if (name !== "zip" && name !== "prompt" && !FILE_NAME.test(name)) {
		return notFound();
	}
	const row = await getFixFiles(deps.db, id);
	const files = row?.status === "done" ? row.result : null;
	const result = finishedResult(audit);
	if (!files || !result) return notFound();
	const headers = {
		"x-content-type-options": "nosniff",
		"cache-control": "private, no-store",
	};
	if (name === "prompt") {
		// The same prompt as AGENT-PROMPT.md in the zip; none when every file was skipped.
		if (files.files.length === 0) return notFound();
		const prompt = agentPrompt(files, {
			url: audit.finalUrl ?? audit.url,
			result,
		});
		return new Response(prompt, {
			headers: {
				...headers,
				"content-type": "text/plain; charset=utf-8",
				"content-disposition": 'attachment; filename="AGENT-PROMPT.txt"',
			},
		});
	}
	if (name === "zip") {
		const body = fixZip(files, {
			url: audit.finalUrl ?? audit.url,
			reportUrl: `${deps.origin}/audits/${audit.id}`,
			result,
		});
		return new Response(body as BodyInit, {
			headers: {
				...headers,
				"content-type": "application/zip",
				"content-disposition": `attachment; filename="agentcheck-fix-${audit.host}.zip"`,
			},
		});
	}
	const file = files.files.find((f) => f.name === name);
	if (!file) return notFound();
	return new Response(file.content, {
		headers: {
			...headers,
			"content-type": file.name.endsWith(".md")
				? "text/markdown; charset=utf-8"
				: "text/plain; charset=utf-8",
			"content-disposition": `attachment; filename="${file.name}"`,
		},
	});
}
