export function Skeleton({ className }: { className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={["rounded-[14px] bg-surface-2", className]
				.filter(Boolean)
				.join(" ")}
		/>
	);
}
