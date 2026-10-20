import type { ReactNode } from "react";

export function Card({
	as: Tag = "div",
	className,
	children,
}: {
	as?: "div" | "section" | "article";
	className?: string;
	children: ReactNode;
}) {
	return (
		<Tag
			className={[
				"rounded-[14px] border border-line bg-surface shadow-card",
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			{children}
		</Tag>
	);
}
