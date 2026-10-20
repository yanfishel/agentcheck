import type { ReactNode } from "react";

export type TableColumn = {
	key: string;
	header: string;
	align?: "left" | "right";
};

export function Table<Row extends Record<string, ReactNode>>({
	columns,
	rows,
	rowKey,
	empty,
}: {
	columns: TableColumn[];
	rows: Row[];
	rowKey: (row: Row) => string;
	empty: ReactNode;
}) {
	const align = (c: TableColumn) =>
		c.align === "right" ? "text-right" : "text-left";
	return (
		<div className="overflow-x-auto rounded-[14px] border border-line bg-surface shadow-card">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr className="border-b border-line bg-surface-2">
						{columns.map((c) => (
							<th
								key={c.key}
								scope="col"
								className={`px-4 py-2.5 font-medium text-muted ${align(c)}`}
							>
								{c.header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td colSpan={columns.length} className="px-4 py-8 text-center">
								{empty}
							</td>
						</tr>
					) : (
						rows.map((row) => (
							<tr
								key={rowKey(row)}
								className="border-b border-line-soft last:border-b-0"
							>
								{columns.map((c) => (
									<td key={c.key} className={`px-4 py-3 ${align(c)}`}>
										{row[c.key]}
									</td>
								))}
							</tr>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}
