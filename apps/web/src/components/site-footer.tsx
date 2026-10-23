import { VERSION } from "@agentcheck/core/version";
import { BookMarked, Compass, Heart, Mail, Package, Scale } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL } from "../content/legal";
import { BrandMark } from "./brand-mark";
import { GithubIcon } from "./github-icon";
import { chipClass } from "./ui";

const linkClass =
	"rounded-full hover:text-foreground focus-visible:outline-2 outline-accent outline-offset-2";

const iconLinkClass =
	"grid size-8 place-items-center rounded-full border border-line text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 outline-accent outline-offset-2";

/** The landing's sections. */
const product = [
	{ label: "How it works", href: "/#how" },
	{ label: "What we check", href: "/#guide" },
	{ label: "Every check", href: "/checks" },
	{ label: "CLI", href: "/#cli" },
	{ label: "README badge", href: "/#badge" },
	{ label: "FAQ", href: "/#faq" },
];

const docs = [
	{ label: "llms.txt", href: "https://llmstxt.org/" },
	{
		label: "robots.txt (RFC 9309)",
		href: "https://www.rfc-editor.org/rfc/rfc9309",
	},
	{ label: "schema.org", href: "https://schema.org/docs/gs.html" },
	{ label: "WAI-ARIA practices", href: "https://www.w3.org/WAI/ARIA/apg/" },
];

const contacts: { label: string; href: string; icon: ReactNode }[] = [
	{
		label: "Send feedback by email",
		href: `mailto:${LEGAL.email}?subject=AgentCheck%20feedback`,
		icon: <Mail aria-hidden="true" className="size-4" />,
	},
	{
		label: "AgentCheck on npm",
		href: "https://www.npmjs.com/package/agentcheck-dev",
		icon: <Package aria-hidden="true" className="size-4" />,
	},
	{
		label: "View source on GitHub",
		href: LEGAL.repo,
		icon: <GithubIcon className="size-4" />,
	},
];

/**
 * The site footer, on every page (the root layout renders it): our mark and a line on what it does, the landing's
 * sections, the standards we check against, legal, then the author's bar (the fishart mark, the credit line and contacts).
 */
export function SiteFooter() {
	return (
		<footer className="border-t border-line bg-surface-2">
			<div className="mx-auto grid w-full max-w-page gap-10 px-4 py-12 text-sm text-muted sm:grid-cols-2 lg:grid-cols-[3fr_2fr_2fr_2fr] lg:gap-8">
				<div className="max-w-sm">
					<p className="flex items-center gap-2.5 text-xl tracking-tight text-foreground">
						<BrandMark className="size-9" />
						<span className="font-medium">
							Agent<b className="font-extrabold">Check</b>
						</span>
					</p>
					<p className="mt-3">
						Checks how ready a website is for AI agents,
						<br />
						search assistants and browser automation.
					</p>
					<p className="mt-3">
						<span className={chipClass("accent")}>{`v${VERSION}`}</span>
					</p>
				</div>
				<div>
					<h2 className="flex items-center gap-1.5 font-semibold text-foreground">
						<Compass aria-hidden="true" className="size-4" />
						Product
					</h2>
					<ul className="mt-3 space-y-1.5">
						{product.map((item) => (
							<li key={item.href}>
								<Link href={item.href} className={linkClass}>
									{item.label}
								</Link>
							</li>
						))}
					</ul>
				</div>
				<div>
					<h2 className="flex items-center gap-1.5 font-semibold text-foreground">
						<BookMarked aria-hidden="true" className="size-4" />
						Standards
					</h2>
					<ul className="mt-3 space-y-1.5">
						{docs.map((doc) => (
							<li key={doc.href}>
								<a href={doc.href} className={linkClass}>
									{doc.label}
								</a>
							</li>
						))}
					</ul>
				</div>
				<div>
					<h2 className="flex items-center gap-1.5 font-semibold text-foreground">
						<Scale aria-hidden="true" className="size-4" />
						Legal
					</h2>
					<ul className="mt-3 space-y-1.5">
						<li>
							<Link href="/privacy" className={linkClass}>
								Privacy Policy
							</Link>
						</li>
						<li>
							<Link href="/terms" className={linkClass}>
								Terms of Use
							</Link>
						</li>
						<li>
							<a href={LEGAL.repo} className={linkClass}>
								{`Source code (${LEGAL.licence})`}
							</a>
						</li>
					</ul>
				</div>
			</div>

			<div className="border-t border-line">
				<div className="mx-auto grid w-full max-w-page items-center gap-4 px-4 py-4 text-center text-sm text-muted sm:grid-cols-[1fr_auto_1fr] sm:text-left">
					<a
						href="https://fishart.co.il"
						target="_blank"
						rel="noopener noreferrer"
						aria-label="fishart.co.il"
						className="justify-self-center rounded focus-visible:outline-2 outline-accent outline-offset-4 sm:justify-self-start"
					>
						{/* biome-ignore lint/performance/noImgElement: a tiny static mark; next/image adds nothing here. */}
						<img
							src="/fishart.png"
							alt="fishart"
							width={90}
							height={21}
							className="h-4 w-auto opacity-90 invert dark:invert-0"
						/>
					</a>
					<p className="justify-self-center">
						AgentCheck © {new Date().getFullYear()}. Made with{" "}
						<Heart
							aria-label="love"
							role="img"
							className="inline size-3.5 -translate-y-px fill-accent text-accent"
						/>{" "}
						for the web
					</p>
					<ul className="flex items-center justify-self-center gap-2 sm:justify-self-end">
						{contacts.map((contact) => (
							<li key={contact.href}>
								<a
									href={contact.href}
									aria-label={contact.label}
									title={contact.label}
									className={iconLinkClass}
									{...(contact.href.startsWith("http")
										? { target: "_blank", rel: "noopener noreferrer" }
										: {})}
								>
									{contact.icon}
								</a>
							</li>
						))}
					</ul>
				</div>
			</div>
		</footer>
	);
}
