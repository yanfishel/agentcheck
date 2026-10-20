import { type AuditStatus, countAudits, listAudits } from "@agentcheck/db";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { AdminAudits } from "../../../components/admin-audits";
import { AdminShell } from "../../../components/admin-nav";
import { Pagination, SEARCH_MAX } from "../../../components/ui";
import { getDb } from "../../../server/current-user";
import { requireAdmin } from "../../../server/guards";
import { pageWindow, searchQuery } from "../../../server/paging";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Audits — Admin — AgentCheck",
	robots: { index: false },
};

const PAGE_SIZE = 25;

const STATUSES: readonly AuditStatus[] = [
	"queued",
	"running",
	"done",
	"failed",
];

export default async function AdminAuditsPage({
	searchParams,
}: PageProps<"/admin/audits">) {
	await auth.protect();
	await requireAdmin();
	const params = await searchParams;
	const status = STATUSES.find((s) => s === params.status);
	const q = searchQuery(params.q, SEARCH_MAX);
	const db = getDb();
	const { page, pages, offset } = pageWindow(
		params.page,
		await countAudits(db, { status, search: q }),
		PAGE_SIZE,
	);
	const rows = await listAudits(db, {
		status,
		search: q,
		limit: PAGE_SIZE,
		offset,
	});
	return (
		<AdminShell current="/admin/audits">
			<AdminAudits rows={rows} status={status} q={q} />
			<Pagination
				page={page}
				pages={pages}
				path="/admin/audits"
				query={{ status, q }}
			/>
		</AdminShell>
	);
}
