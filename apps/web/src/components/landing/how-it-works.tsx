import { Link, type LucideIcon, ScanSearch, Wrench } from "lucide-react";
import { HeroBackdrop } from "./hero-backdrop";

const steps: { icon: LucideIcon; title: string; text: string }[] = [
	{
		icon: Link,
		title: "Paste a URL",
		text: "Start from any public page. We read it along with the site's robots.txt and llms.txt.",
	},
	{
		icon: ScanSearch,
		title: "We run the checks",
		text: "Quick reads your pages without a browser. Full also renders them in Chromium and needs an account.",
	},
	{
		icon: Wrench,
		title: "Fix what matters",
		text: "Every failed check comes with a remediation and, where possible, a snippet to copy.",
	},
];

/**
 * The three steps on a full-width plum band (the page must not wrap it in a
 * width container), the steps as light tiles on the plum; no lit cells.
 */
export function HowItWorks() {
	return (
		<section
			aria-labelledby="how"
			className="on-band relative isolate mt-20 overflow-hidden bg-accent py-16 text-accent-fg sm:py-20"
		>
			<HeroBackdrop cells={false} />
			<div className="relative mx-auto w-full max-w-page px-4">
				<h2 id="how" className="text-2xl font-bold tracking-tight sm:text-3xl">
					How it works
				</h2>
				<ol className="mt-6 grid gap-4 md:grid-cols-3">
					{steps.map(({ icon: Icon, title, text }) => (
						<li
							key={title}
							className="rounded-[14px] border border-accent-fg/15 bg-accent-fg/10 p-5"
						>
							<span className="grid size-11 place-items-center rounded-xl bg-accent-fg/15 text-accent-fg">
								<Icon aria-hidden="true" className="size-5" />
							</span>
							<h3 className="mt-4 font-semibold">{title}</h3>
							<p className="mt-1 text-sm text-accent-fg/85">{text}</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
