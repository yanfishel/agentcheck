import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { getCurrentUser } from "../server/current-user";
import { BrandMark } from "./brand-mark";
import { ThemeMenu } from "./theme-menu";
import { UserMenu } from "./user-menu";

type Tone = "band" | "plain";

/** Server-side only; the database is never touched for signed-out visitors. */
async function AdminLink({ className }: { className: string }) {
	const { userId } = await auth();
	if (!userId) return null;
	try {
		const user = await getCurrentUser();
		if (user?.role !== "admin" || user.blocked) return null;
	} catch (error) {
		console.error(
			"Could not resolve the current user for the header:",
			error instanceof Error ? error.name : "unknown error",
		);
		return null;
	}
	return (
		<Link href="/admin" className={className}>
			Admin
		</Link>
	);
}

const looks: Record<
	Tone,
	{
		bar: string;
		mark: string;
		home: string;
		link: string;
		icon: string;
		avatar: string;
		signUp: string;
	}
> = {
	band: {
		bar: "on-band bg-accent text-accent-fg",
		mark: "text-accent-fg",
		home: "outline-accent-fg",
		link: "whitespace-nowrap rounded-full px-2 py-1 text-accent-fg/85 hover:text-accent-fg focus-visible:outline-2 outline-accent-fg outline-offset-2",
		icon: "grid size-8 place-items-center rounded-full bg-accent-fg/15 text-accent-fg hover:bg-accent-fg/25 focus-visible:outline-2 outline-accent-fg outline-offset-2",
		avatar:
			"grid size-8 place-items-center rounded-full hover:opacity-90 focus-visible:outline-2 outline-accent-fg outline-offset-2",
		signUp:
			"whitespace-nowrap rounded-full bg-accent-fg px-3.5 py-1.5 font-semibold text-accent hover:opacity-90 focus-visible:outline-2 outline-accent-fg outline-offset-2",
	},
	plain: {
		bar: "bg-background text-foreground border-b border-line",
		mark: "",
		home: "outline-accent",
		link: "whitespace-nowrap rounded-full px-2 py-1 text-muted hover:text-foreground focus-visible:outline-2 outline-accent outline-offset-2",
		icon: "grid size-8 place-items-center rounded-full text-muted hover:bg-accent-soft hover:text-foreground focus-visible:outline-2 outline-accent outline-offset-2",
		avatar:
			"grid size-8 place-items-center rounded-full hover:opacity-90 focus-visible:outline-2 outline-accent outline-offset-2",
		signUp:
			"whitespace-nowrap rounded-full bg-accent px-3.5 py-1.5 font-semibold text-accent-fg hover:opacity-90 focus-visible:outline-2 outline-accent outline-offset-2",
	},
};

/**
 * The site header. `band` (default) sits on the plum fill, so the landing hero
 * and the report band continue it without a seam; `plain` is for later pages.
 */
export function SiteHeader({ tone = "band" }: { tone?: Tone }) {
	const look = looks[tone];
	return (
		<header className={look.bar}>
			<div className="mx-auto flex w-full max-w-page items-center justify-between gap-2 px-4 py-4 sm:gap-4">
				<Link
					href="/"
					className={`flex shrink-0 items-center gap-2 rounded-xl text-base tracking-tight sm:gap-2.5 sm:text-xl focus-visible:outline-2 outline-offset-4 ${look.home}`}
				>
					<BrandMark className={`size-9 sm:size-10 ${look.mark}`.trim()} />
					{/* A phone shows the mark only; the name stays for screen readers. */}
					<span className="sr-only font-medium sm:not-sr-only">
						Agent<b className="font-extrabold">Check</b>
					</span>
				</Link>
				<nav
					aria-label="Main"
					className="flex items-center gap-1.5 text-sm font-medium sm:gap-3"
				>
					<Show when="signed-out">
						<SignInButton mode="modal">
							<button type="button" className={look.link}>
								Sign in
							</button>
						</SignInButton>
						<SignUpButton mode="modal">
							<button type="button" className={look.signUp}>
								Sign up
							</button>
						</SignUpButton>
						<ThemeMenu className={look.icon} />
					</Show>
					<Show when="signed-in">
						<Link href="/history" className={look.link}>
							History
						</Link>
						<AdminLink className={look.link} />
						<ThemeMenu className={look.icon} />
						<UserMenu className={look.avatar} />
					</Show>
				</nav>
			</div>
		</header>
	);
}
