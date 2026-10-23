import { CATEGORIES } from "@agentcheck/core/scoring";
import { BookOpen, ListChecks } from "lucide-react";
import Link from "next/link";
import { FACTS_LINE } from "../../content/facts";
import { CATEGORY_META, CategoryIcon, type CategoryId } from "../category-meta";
import { Card, chipClass, Tooltip } from "../ui";
import { WeightRing } from "./weight-ring";

type Doc = { label: string; href: string };

/** Weights come from the scoring module, so the landing never drifts from the score. */
function weightOf(id: CategoryId): number {
	return CATEGORIES.find((category) => category.id === id)?.weight ?? 0;
}

/** The guide copy per category; the order is the scoring module's, never set here. */
const copy: Record<
	CategoryId,
	{
		title: string;
		text: string;
		aside?: string;
		docs: Doc[];
	}
> = {
	"bot-access": {
		title: "robots.txt says who may come in",
		text: "AI crawlers have their own names and obey robots.txt, which can now also say what they may do with your pages. Plenty of sites block them by accident with a rule copied years ago, or hide pages with a stray noindex, and a sitemap with dead links sends them nowhere.",
		aside: "Your old robots.txt may not be a fan of ChatGPT.",
		docs: [
			{
				label: "OpenAI crawlers",
				href: "https://developers.openai.com/api/docs/bots",
			},
			{
				label: "ClaudeBot",
				href: "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
			},
			{
				label: "PerplexityBot",
				href: "https://docs.perplexity.ai/docs/resources/perplexity-crawlers",
			},
			{
				label: "Google-Extended",
				href: "https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers",
			},
			{ label: "RFC 9309", href: "https://www.rfc-editor.org/rfc/rfc9309" },
			{ label: "contentsignals.org", href: "https://contentsignals.org/" },
			{ label: "sitemaps.org", href: "https://www.sitemaps.org/protocol.html" },
		],
	},
	"ai-manifests": {
		title: "llms.txt is a table of contents for models",
		text: "A plain markdown file at the root that points to your important pages, plus markdown versions of those pages that a page links to and serves to agents that ask for markdown.",
		aside: "A young standard, and ten minutes of work.",
		docs: [
			{ label: "llmstxt.org", href: "https://llmstxt.org/" },
			{
				label: "RFC 8288 (Link)",
				href: "https://www.rfc-editor.org/rfc/rfc8288",
			},
		],
	},
	"content-semantics": {
		title: "Structure tells it what the page is",
		text: "One h1, headings in order, a canonical URL, a description and a language, JSON-LD and OpenGraph, and real content in the HTML itself, not only after JavaScript runs.",
		docs: [
			{ label: "schema.org", href: "https://schema.org/docs/gs.html" },
			{
				label: "Google structured data",
				href: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
			},
			{ label: "Open Graph", href: "https://ogp.me/" },
			{
				label: "Google canonical URLs",
				href: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
			},
		],
	},
	"agentic-actionability": {
		title: "Buttons with names let agents act",
		text: "Browser agents book, buy and fill in forms. A div that pretends to be a button, or a captcha on a plain page, stops them.",
		aside: "Agents cannot click on vibes.",
		docs: [
			{
				label: "MDN: accessible name",
				href: "https://developer.mozilla.org/en-US/docs/Glossary/Accessible_name",
			},
			{ label: "WAI-ARIA practices", href: "https://www.w3.org/WAI/ARIA/apg/" },
		],
	},
};

/** One order everywhere: the scoring module's (Manifests, Bots, Semantics, Actions). */
const categories = CATEGORIES.map(({ id }) => ({ id, ...copy[id] }));

/** The category weights as pills under the form, then the guide: what each category is and why it matters. */
export function Categories() {
	return (
		<>
			<ul className="mt-6 flex flex-wrap justify-center gap-2">
				{categories.map(({ id, title }) => {
					const { short, icon: Icon, text } = CATEGORY_META[id];
					return (
						<li key={id}>
							<Tooltip content={title}>
								<button
									type="button"
									className="inline-flex cursor-default items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-semibold focus-visible:outline-2 outline-accent outline-offset-2"
								>
									<Icon aria-hidden="true" className={`size-4 ${text}`} />
									<span className="text-base font-bold tabular-nums">
										{weightOf(id)}%
									</span>
									{short}
								</button>
							</Tooltip>
						</li>
					);
				})}
			</ul>

			<section aria-labelledby="guide" className="mt-20">
				<h2
					id="guide"
					className="text-2xl font-bold tracking-tight sm:text-3xl"
				>
					What an AI reads before it reads you
				</h2>
				<p className="mt-2 text-muted">
					An AI answer cites a handful of sources. Four things decide whether
					your site can be one of them, and the score weighs them like this.
				</p>
				<ul className="mt-6 grid gap-4 lg:grid-cols-2">
					{categories.map(({ id, title, text, aside, docs }) => (
						<li key={id} className="flex">
							<Card className="flex flex-1 gap-4 p-5">
								<CategoryIcon id={id} />
								<div className="min-w-0 flex-1">
									<div className="flex items-start justify-between gap-3">
										<h3 className="pt-2.5 font-semibold">{title}</h3>
										<WeightRing id={id} />
									</div>
									<p className="mt-1 text-sm text-muted">
										{text}
										{aside ? (
											<>
												{" "}
												<em className="text-accent">{aside}</em>
											</>
										) : null}
									</p>
									<ul
										aria-label="Documentation"
										className="mt-3 flex flex-wrap gap-1.5"
									>
										{docs.map((doc) => (
											<li key={doc.href}>
												<a
													href={doc.href}
													className={`${chipClass("accent")} gap-1.5 hover:underline underline-offset-2 focus-visible:outline-2 outline-accent outline-offset-2`}
												>
													<BookOpen aria-hidden="true" className="size-3.5" />
													{doc.label}
												</a>
											</li>
										))}
									</ul>
								</div>
							</Card>
						</li>
					))}
				</ul>
				<p className="mt-6 max-w-3xl text-muted">
					{FACTS_LINE}{" "}
					<Link
						href="/checks"
						className="inline-flex items-center gap-1.5 font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 outline-accent outline-offset-2"
					>
						<ListChecks aria-hidden="true" className="size-4" />
						See every check
					</Link>
				</p>
			</section>
		</>
	);
}
