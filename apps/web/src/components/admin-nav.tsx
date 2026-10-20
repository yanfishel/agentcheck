import Link from "next/link";
import type { ReactNode } from "react";

const LINKS = [
	{ href: "/admin", label: "Users" },
	{ href: "/admin/audits", label: "Audits" },
	{ href: "/admin/limits", label: "Limits" },
] as const;

const pill =
	"rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 outline-accent outline-offset-2";

/** Pill tabs; the current page is filled plum and marked with aria-current. */
export function AdminNav({ current }: { current: string }) {
	return (
		<nav aria-label="Admin" className="mt-4 -mx-4 overflow-x-auto px-4">
			<ul className="flex w-max gap-1 rounded-full border border-line bg-surface p-1">
				{LINKS.map((link) => {
					const active = link.href === current;
					return (
						<li key={link.href}>
							<Link
								href={link.href}
								aria-current={active ? "page" : undefined}
								className={`${pill} block ${
									active
										? "bg-accent text-accent-fg"
										: "text-muted hover:bg-surface-2 hover:text-foreground"
								}`}
							>
								{link.label}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

/** The admin page frame: title, pill tabs and the page body. */
export function AdminShell({
	current,
	children,
}: {
	current: string;
	children: ReactNode;
}) {
	return (
		<main className="mx-auto w-full max-w-page px-4 pt-10 pb-16">
			<h1 className="text-3xl font-bold tracking-tight text-balance">Admin</h1>
			<AdminNav current={current} />
			{children}
		</main>
	);
}
