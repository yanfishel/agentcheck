import type { ReactNode } from "react";

export function EmptyState({
	title,
	text,
	action,
}: {
	title: string;
	text?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-line px-6 py-10 text-center">
			<h2 className="text-lg font-bold">{title}</h2>
			{text ? <p className="max-w-md text-muted">{text}</p> : null}
			{action}
		</div>
	);
}
