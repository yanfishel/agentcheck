import { countUsers, listUsers } from "@agentcheck/db";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { AdminShell } from "../../components/admin-nav";
import { BlockToggle } from "../../components/block-toggle";
import {
	Chip,
	ListSearch,
	Pagination,
	SEARCH_MAX,
	Table,
} from "../../components/ui";
import { getDb } from "../../server/current-user";
import { requireAdmin } from "../../server/guards";
import { pageWindow, searchQuery } from "../../server/paging";

export const metadata: Metadata = {
	title: "Users — Admin — AgentCheck",
	robots: { index: false },
};

const PAGE_SIZE = 25;

const COLUMNS = [
	{ key: "email", header: "Email" },
	{ key: "role", header: "Role" },
	{ key: "access", header: "Access" },
	{ key: "joined", header: "Joined" },
	{ key: "action", header: "Action", align: "right" as const },
];

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
	await auth.protect();
	await requireAdmin();
	const params = await searchParams;
	const q = searchQuery(params.q, SEARCH_MAX);
	const db = getDb();
	const { page, pages, offset } = pageWindow(
		params.page,
		await countUsers(db, { search: q }),
		PAGE_SIZE,
	);
	const rows = await listUsers(db, { search: q, limit: PAGE_SIZE, offset });
	return (
		<AdminShell current="/admin">
			<div className="mt-6 flex flex-col gap-3">
				<ListSearch
					path="/admin"
					q={q}
					placeholder="Search email"
					label="Search users by email"
				/>
				<Table
					columns={COLUMNS}
					rowKey={(row) => String(row.id)}
					empty={
						<p className="text-muted">
							{q ? "No users match this search." : "No users yet."}
						</p>
					}
					rows={rows.map((u) => ({
						id: u.id,
						email: u.email ? (
							<span className="break-all">{u.email}</span>
						) : (
							<span className="text-muted">No email</span>
						),
						role:
							u.role === "admin" ? (
								<Chip tone="accent">Admin</Chip>
							) : (
								<Chip>User</Chip>
							),
						access: u.blocked ? (
							<Chip tone="fail">Blocked</Chip>
						) : (
							<Chip tone="pass">Active</Chip>
						),
						joined: (
							<span className="whitespace-nowrap font-mono text-xs text-muted">
								{u.createdAt.toISOString().slice(0, 10)}
							</span>
						),
						action: (
							<BlockToggle
								id={u.id}
								email={u.email || u.id}
								blocked={u.blocked}
								isAdmin={u.role === "admin"}
							/>
						),
					}))}
				/>
			</div>
			<Pagination page={page} pages={pages} path="/admin" query={{ q }} />
		</AdminShell>
	);
}
