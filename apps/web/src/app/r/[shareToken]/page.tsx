import { getAuditByShareToken } from "@agentcheck/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AuditReport } from "../../../components/audit-report";
import { getDb } from "../../../server/current-user";
import { publicOrigin } from "../../../server/share";
import { OG_SIZE } from "../../_og/draw";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: PageProps<"/r/[shareToken]">): Promise<Metadata> {
	const { shareToken } = await params;
	const audit = await getAuditByShareToken(getDb(), shareToken);
	const robots = { index: false };
	if (!audit) return { title: "Shared report — AgentCheck", robots };
	const title = `Audit of ${new URL(audit.url).hostname} — AgentCheck`;
	// A done audit always has a score and grade; the plain card covers the rest.
	const description =
		audit.score !== null && audit.grade
			? `AI readiness score ${audit.score}/100 (${audit.grade}) on AgentCheck`
			: undefined;
	if (audit.score === null || !audit.grade) {
		return {
			title,
			description,
			robots,
			openGraph: {
				title,
				description,
				siteName: "AgentCheck",
				type: "website",
			},
			twitter: { card: "summary", title, description },
		};
	}
	const host = new URL(audit.url).hostname;
	const images = [
		{
			url: `${publicOrigin(await headers())}/api/shared/${shareToken}/og.png`,
			...OG_SIZE,
			alt: `AgentCheck: ${host} scores ${audit.score}/100 (${audit.grade})`,
		},
	];
	return {
		title,
		description,
		robots,
		openGraph: {
			title,
			description,
			siteName: "AgentCheck",
			type: "website",
			images,
		},
		twitter: { card: "summary_large_image", title, description, images },
	};
}

export default async function SharedReportPage({
	params,
}: PageProps<"/r/[shareToken]">) {
	const { shareToken } = await params;
	const audit = await getAuditByShareToken(getDb(), shareToken);
	if (!audit?.result) notFound();
	// Only the report: actions (badge, export, share) belong to the owner's page.
	// AuditReport draws the full-width band and keeps its own page width.
	return (
		<main className="w-full pb-16">
			<AuditReport
				result={audit.result}
				mode={audit.mode}
				label="Shared report"
				screenshot={
					audit.hasScreenshot
						? {
								small: `/api/shared/${shareToken}/screenshot`,
								large: `/api/shared/${shareToken}/screenshot?size=large`,
							}
						: undefined
				}
				favicon={
					audit.hasFavicon ? `/api/shared/${shareToken}/favicon` : undefined
				}
			/>
		</main>
	);
}
