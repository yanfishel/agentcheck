import { getAudit, getFixFiles } from "@agentcheck/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AuditFailed } from "../../../components/audit-failed";
import { AuditProgress } from "../../../components/audit-progress";
import { AuditReport } from "../../../components/audit-report";
import { FixFilesFooter } from "../../../components/report/fix-files/footer";
import { FixFilesPanel } from "../../../components/report/fix-files/panel";
import {
	FixFilesProvider,
	type FixFilesRole,
} from "../../../components/report/fix-files/provider";
import { ReportActions } from "../../../components/report-actions";
import {
	canViewAudit,
	currentViewer,
	requireAuditAccess,
} from "../../../server/audit-access";
import { getDb } from "../../../server/current-user";
import { fixFilesView } from "../../../server/fix-files";
import { publicOrigin, shareUrlFromHeaders } from "../../../server/share";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: PageProps<"/audits/[id]">): Promise<Metadata> {
	const { id } = await params;
	const audit = await getAudit(getDb(), id);
	const robots = { index: false };
	// Never reveal the host of an audit the viewer may not see.
	if (!audit || !canViewAudit(audit, await currentViewer(audit))) {
		return { title: "Audit — AgentCheck", robots };
	}
	return {
		title: `Audit of ${new URL(audit.url).hostname} — AgentCheck`,
		robots,
	};
}

export default async function AuditPage({ params }: PageProps<"/audits/[id]">) {
	const { id } = await params;
	const audit = await getAudit(getDb(), id);
	if (!audit) notFound();
	const viewer = await currentViewer(audit);
	requireAuditAccess(audit, viewer);

	const failed = (error: string) => (
		<AuditFailed
			error={error}
			url={audit.url}
			mode={audit.mode}
			at={audit.finishedAt ?? audit.createdAt}
			favicon={audit.hasFavicon ? `/api/audits/${audit.id}/favicon` : undefined}
			canRerun={viewer !== null || audit.mode === "quick"}
		/>
	);

	let content: ReactNode;
	switch (audit.status) {
		case "queued":
		case "running":
			content = (
				<AuditProgress
					id={audit.id}
					status={audit.status}
					url={audit.url}
					mode={audit.mode}
					queuedMs={Date.now() - audit.createdAt.getTime()}
				/>
			);
			break;
		case "failed":
			content = failed(audit.error ?? "Unknown error");
			break;
		case "done": {
			if (!audit.result) {
				content = failed("Result missing");
				break;
			}
			const requestHeaders = await headers();
			const token = audit.shareToken;
			const role: FixFilesRole =
				viewer !== null && viewer.id === audit.userId
					? "owner"
					: viewer?.role === "admin"
						? "admin"
						: "other";
			// Fix files belong to the owner (the admin reads them); anyone else
			// only sees the offer, which leads to the account prompts.
			const fixFiles = fixFilesView(
				audit,
				role === "other" ? null : await getFixFiles(getDb(), audit.id),
			);
			content = (
				<FixFilesProvider
					auditId={audit.id}
					url={audit.url}
					finalUrl={audit.finalUrl ?? audit.url}
					mode={audit.mode}
					role={role}
					initial={fixFiles}
				>
					<AuditReport
						result={audit.result}
						mode={audit.mode}
						screenshot={
							audit.hasScreenshot
								? {
										small: `/api/audits/${audit.id}/screenshot`,
										large: `/api/audits/${audit.id}/screenshot?size=large`,
									}
								: undefined
						}
						favicon={
							audit.hasFavicon ? `/api/audits/${audit.id}/favicon` : undefined
						}
						fixFiles={<FixFilesPanel />}
						categoryFooter={(categoryId) => (
							<FixFilesFooter categoryId={categoryId} />
						)}
						actions={
							<ReportActions
								auditId={audit.id}
								mode={audit.mode}
								url={audit.url}
								score={audit.result.score}
								canRerun={viewer !== null || audit.mode === "quick"}
								canShare={viewer !== null && viewer.id === audit.userId}
								shareToken={token}
								shareUrl={
									token ? shareUrlFromHeaders(token, requestHeaders) : null
								}
								exportBase={`/api/audits/${audit.id}/export`}
								badgeUrl={
									token
										? `${publicOrigin(requestHeaders)}/api/shared/${token}/badge.svg`
										: null
								}
							/>
						}
					/>
				</FixFilesProvider>
			);
			break;
		}
	}

	// Report, progress and failure draw a full-width plum band under the header
	// and keep their own page width.
	return <main className="w-full pb-16">{content}</main>;
}
