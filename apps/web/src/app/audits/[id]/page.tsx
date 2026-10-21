import { getAudit, getFixFiles } from "@agentcheck/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AuditFailed } from "../../../components/audit-failed";
import { type FinalReport, LiveReport } from "../../../components/live-report";
import type { FixFilesRole } from "../../../components/report/fix-files/provider";
import { ReportActions } from "../../../components/report-actions";
import {
	auditStatusBody,
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
	if (audit.status === "failed") {
		content = failed(audit.error ?? "Unknown error");
	} else if (audit.status === "done" && !audit.result) {
		content = failed("Result missing");
	} else {
		const role: FixFilesRole =
			viewer !== null && viewer.id === audit.userId
				? "owner"
				: viewer?.role === "admin"
					? "admin"
					: "other";
		const result = audit.status === "done" ? audit.result : null;
		// Fix files belong to the owner (the admin reads them) of a finished
		// audit; anyone else only sees the offer, which leads to the account
		// prompts. While the audit runs the kinds come from its progress.
		const fixFiles = fixFilesView(
			audit,
			role === "other" || !result ? null : await getFixFiles(getDb(), audit.id),
		);
		let final: FinalReport | undefined;
		const token = audit.shareToken;
		const canRerun = viewer !== null || audit.mode === "quick";
		const canShare = viewer !== null && viewer.id === audit.userId;
		let pendingActions: ReactNode;
		if (!result) {
			// The same buttons the finished report will show this viewer, inert.
			pendingActions = (
				<ReportActions
					pending
					auditId={audit.id}
					mode={audit.mode}
					url={audit.url}
					canRerun={canRerun}
					canShare={canShare}
					shareToken={token}
					shareUrl={null}
					exportBase={`/api/audits/${audit.id}/export`}
					badgeUrl={null}
				/>
			);
		} else {
			const requestHeaders = await headers();
			final = {
				result,
				now: Date.now(),
				screenshot: audit.hasScreenshot
					? {
							small: `/api/audits/${audit.id}/screenshot`,
							large: `/api/audits/${audit.id}/screenshot?size=large`,
						}
					: undefined,
				favicon: audit.hasFavicon
					? `/api/audits/${audit.id}/favicon`
					: undefined,
				actions: (
					<ReportActions
						auditId={audit.id}
						mode={audit.mode}
						url={audit.url}
						score={result.score}
						canRerun={canRerun}
						canShare={canShare}
						shareToken={token}
						shareUrl={token ? shareUrlFromHeaders(token, requestHeaders) : null}
						exportBase={`/api/audits/${audit.id}/export`}
						badgeUrl={
							token
								? `${publicOrigin(requestHeaders)}/api/shared/${token}/badge.svg`
								: null
						}
					/>
				),
			};
		}
		// One component at one place for queued, running and done, so the
		// refresh at the end updates the running report instead of replacing it.
		content = (
			<LiveReport
				id={audit.id}
				status={audit.status}
				url={audit.url}
				mode={audit.mode}
				queuedMs={Date.now() - audit.createdAt.getTime()}
				final={final}
				pendingActions={pendingActions}
				initialProgress={
					audit.status === "done" ? null : auditStatusBody(audit).progress
				}
				fixFiles={{ role, initial: fixFiles }}
			/>
		);
	}

	// Report, progress and failure draw a full-width plum band under the header
	// and keep their own page width.
	return <main className="w-full pb-16">{content}</main>;
}
