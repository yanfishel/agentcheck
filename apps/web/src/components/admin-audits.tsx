import type { AdminAuditRow, AuditStatus } from "@agentcheck/db";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import {
	Button,
	Chip,
	ListSearch,
	Menu,
	pageHref,
	statusTone,
	Table,
	Tooltip,
} from "./ui";

const FILTERS: { label: string; status?: AuditStatus }[] = [
	{ label: "All" },
	{ label: "Queued", status: "queued" },
	{ label: "Running", status: "running" },
	{ label: "Done", status: "done" },
	{ label: "Failed", status: "failed" },
];

const COLUMNS = [
	{ key: "created", header: "Created" },
	{ key: "user", header: "User" },
	{ key: "url", header: "URL" },
	{ key: "mode", header: "Mode" },
	{ key: "status", header: "Status" },
	{ key: "score", header: "Score", align: "right" as const },
];

const formatDate = (date: Date) =>
	`${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** The list's own URL for a filter: page 1, the search kept. */
export function auditsHref(status?: AuditStatus, q?: string) {
	return pageHref("/admin/audits", { status, q }, 1);
}

export function StatusFilter({
	status,
	q,
}: {
	status?: AuditStatus;
	q?: string;
}) {
	return (
		<Menu
			label="Filter by status"
			trigger={
				<Button
					variant="secondary"
					size="sm"
					icon={<ChevronDown aria-hidden="true" className="size-4" />}
					className="flex-row-reverse"
				>
					Status: {status ?? "all"}
				</Button>
			}
			items={FILTERS.map((filter) => ({
				label: filter.label,
				href: auditsHref(filter.status, q),
				selected: filter.status === status,
			}))}
		/>
	);
}

/** The failed view adds the error column. */
export function AdminAudits({
	rows,
	status,
	q,
}: {
	rows: AdminAuditRow[];
	status?: AuditStatus;
	q?: string;
}) {
	const columns =
		status === "failed"
			? [...COLUMNS, { key: "error", header: "Error" }]
			: COLUMNS;
	return (
		<div className="mt-6 flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<ListSearch
					path="/admin/audits"
					q={q}
					query={{ status }}
					placeholder="Search URL or email"
					label="Search audits by URL or email"
				/>
				<StatusFilter status={status} q={q} />
			</div>
			<Table
				columns={columns}
				rowKey={(row) => String(row.id)}
				empty={<p className="text-muted">No audits match this filter.</p>}
				rows={rows.map((row) => ({
					id: row.id,
					created: (
						<span className="whitespace-nowrap font-mono text-xs text-muted">
							{formatDate(row.createdAt)}
						</span>
					),
					user: row.userEmail ?? <span className="text-muted">Anonymous</span>,
					url: (
						<Tooltip content={row.url}>
							<Link
								href={`/audits/${row.id}`}
								className="block max-w-[28ch] truncate font-mono text-xs text-accent hover:underline"
							>
								{row.url}
							</Link>
						</Tooltip>
					),
					mode: <Chip>{row.mode === "full" ? "Full" : "Quick"}</Chip>,
					status: <Chip tone={statusTone(row.status)}>{row.status}</Chip>,
					score: (
						<span className="whitespace-nowrap font-mono tabular-nums">
							{row.score === null ? (
								<span className="text-muted">–</span>
							) : (
								`${row.score} ${row.grade ?? ""}`.trim()
							)}
						</span>
					),
					error: (
						<span className="block min-w-[24ch] text-fail">
							{row.error ?? ""}
						</span>
					),
				}))}
			/>
		</div>
	);
}
