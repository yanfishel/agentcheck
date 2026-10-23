import { CHECK_DOCS, CHECKS, PROTOCOLS, SERVICE_CRAWL } from "@agentcheck/core";
import { CATEGORIES } from "@agentcheck/core/scoring";
import { Check, Minus, TriangleAlert, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "../../components/category-meta";
import { jsonLd } from "../../components/landing/structured-data";
import { FACTS, FACTS_LINE } from "../../content/facts";
import { SITE } from "../../content/site";

const TITLE = "What AgentCheck checks";
const DESCRIPTION = `Every check of the AgentCheck audit: what it looks at, when it passes, warns or fails, and the standard it rests on. ${FACTS.checks} checks in ${FACTS.categories} categories.`;

export const metadata: Metadata = {
	title: `${TITLE} — AgentCheck`,
	description: DESCRIPTION,
	alternates: {
		canonical: "/checks",
		types: { "text/markdown": "/checks.md" },
	},
};

/** A check's share of the total score when every category is scored. */
function shareOf(id: string): string {
	const check = CHECKS.find((c) => c.id === id);
	const category = CATEGORIES.find((c) => c.id === check?.category);
	if (!check || !category) return "";
	const total = CHECKS.filter((c) => c.category === category.id).reduce(
		(sum, c) => sum + c.weight,
		0,
	);
	const percent = (category.weight * check.weight) / total;
	return percent < 1
		? "under 1% of the score"
		: `about ${Math.round(percent)}% of the score`;
}

const OUTCOMES = [
	{ key: "pass", label: "Pass", Icon: Check, tone: "text-pass" },
	{ key: "warn", label: "Warn", Icon: TriangleAlert, tone: "text-warn" },
	{ key: "fail", label: "Fail", Icon: X, tone: "text-fail" },
	{ key: "skip", label: "Skipped", Icon: Minus, tone: "text-muted" },
] as const;

const GROUPS = [
	{ id: "agents", title: "Agents and APIs" },
	{ id: "auth", title: "Sign-in and keys" },
	{ id: "commerce", title: "Commerce" },
] as const;

const page = {
	"@context": "https://schema.org",
	"@type": "WebPage",
	name: TITLE,
	url: `${SITE.url}/checks`,
	description: DESCRIPTION,
	isPartOf: {
		"@type": "WebSite",
		"@id": `${SITE.url}/#website`,
		url: `${SITE.url}/`,
	},
};

/**
 * Every check, from the engine's registry and CHECK_DOCS: a new check shows
 * up here by itself (and CI fails without its documentation).
 */
export default function ChecksPage() {
	return (
		<main className="mx-auto w-full max-w-page flex-1 px-4 pt-12 pb-16">
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant JSON-LD, `<` escaped.
				dangerouslySetInnerHTML={{ __html: jsonLd(page) }}
			/>
			<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{TITLE}</h1>
			<p className="mt-4 max-w-3xl text-lg text-muted">{FACTS_LINE}</p>
			<p className="mt-3 max-w-3xl text-muted">
				Each category scores 0 to 100 from its checks; the total weighs the
				categories. A warn counts half, a skipped check not at all. Without a
				browser the Agentic Actionability category is skipped and the others
				share its weight.
			</p>

			{CATEGORIES.map((category) => (
				<section
					key={category.id}
					aria-labelledby={`cat-${category.id}`}
					className="mt-12"
				>
					<h2
						id={`cat-${category.id}`}
						className="flex items-center gap-3 text-2xl font-bold tracking-tight"
					>
						<CategoryIcon id={category.id} />
						<span>
							{category.title}{" "}
							<span className="ml-1 text-base font-normal text-muted">
								{`${category.weight}% of the score`}
							</span>
						</span>
					</h2>
					<ul className="mt-4 grid gap-3">
						{CHECKS.filter((c) => c.category === category.id).map((check) => {
							const doc = CHECK_DOCS[check.id];
							if (!doc) return null;
							return (
								<li
									key={check.id}
									id={check.id}
									className="rounded-[14px] border border-line bg-surface p-5 shadow-card"
								>
									<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
										<h3 className="font-semibold">{check.title}</h3>
										<span className="text-sm text-muted">
											<code className="font-mono">{check.id}</code>
											{`, ${shareOf(check.id)}${check.scope === "site" ? ", once per site" : ""}`}
										</span>
									</div>
									<p className="mt-1 text-muted">{doc.summary}</p>
									<dl className="mt-3 grid gap-1.5 text-sm">
										{OUTCOMES.map(({ key, label, Icon, tone }) =>
											doc[key] ? (
												<div
													key={key}
													className="grid grid-cols-[18px_4.5rem_1fr] gap-x-2"
												>
													<Icon
														aria-hidden="true"
														className={`mt-0.5 size-4 ${tone}`}
													/>
													<dt className="font-semibold">{label}</dt>
													<dd>{doc[key]}</dd>
												</div>
											) : null,
										)}
									</dl>
									<p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
										{doc.sources.map((source) => (
											<a
												key={source.href}
												href={source.href}
												rel="noopener noreferrer"
												className="text-accent underline underline-offset-2"
											>
												{source.label}
											</a>
										))}
									</p>
								</li>
							);
						})}
					</ul>
				</section>
			))}

			<section aria-labelledby="pages" className="mt-12 max-w-3xl">
				<h2 id="pages" className="text-2xl font-bold tracking-tight">
					Across the site
				</h2>
				<p className="mt-3 text-muted">
					{`A full check audits up to ${SERVICE_CRAWL.limit} pages of the site: the ones in its sitemap, spread over it, else the links of its menu. The browser runs on the first page; the others get every check that needs none. Checks marked “once per site” run once and count for every page. The site score is the average of the pages that could be read; a page that cannot be read is listed with the reason. The command line does the same with --crawl, up to 50 pages.`}
				</p>
			</section>

			<section aria-labelledby="protocols" className="mt-12 max-w-3xl">
				<h2 id="protocols" className="text-2xl font-bold tracking-tight">
					Agent protocols, not scored
				</h2>
				<p className="mt-3 text-muted">
					{`Every report also looks for ${FACTS.protocols} documents a site may publish for agents beyond its content, and lists the ones it finds. They depend on what the site offers, so they never change the score.`}
				</p>
				{GROUPS.map((group) => (
					<div key={group.id} className="mt-4">
						<h3 className="font-semibold">{group.title}</h3>
						<ul className="mt-1 list-disc pl-5 text-muted">
							{PROTOCOLS.filter((p) => p.group === group.id).map((p) => (
								<li key={p.id}>
									{p.title}{" "}
									<code className="font-mono text-sm">{p.paths[0]}</code>
								</li>
							))}
						</ul>
					</div>
				))}
			</section>

			<section aria-labelledby="not-checked" className="mt-12 max-w-3xl">
				<h2 id="not-checked" className="text-2xl font-bold tracking-tight">
					What we do not check, and why
				</h2>
				<ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
					<li>
						Whether a crawler gets other content than a browser (cloaking): a
						made-up crawler user agent is blocked by bot protection that lets
						the real crawler in, so the answer would be wrong.
					</li>
					<li>
						sitemap.md, required AGENTS.md sections, a glossary link: no
						published standard defines them, and criteria we invent would make
						the audit less accurate. AGENTS.md is listed among the protocols
						when a site serves it.
					</li>
					<li>
						DNS-based agent discovery, and payment protocols that can only be
						guessed from an HTTP 402: the first needs lookups outside the site,
						the second would be guesswork.
					</li>
				</ul>
			</section>

			<section aria-labelledby="fixes" className="mt-12 max-w-3xl">
				<h2 id="fixes" className="text-2xl font-bold tracking-tight">
					Fix files
				</h2>
				<p className="mt-3 text-muted">
					For what a file can fix, the report builds it from the site's own
					pages: robots.txt, llms.txt, llms-full.txt, a markdown version of the
					page and head tags, plus a README and a prompt for a coding agent.
					What only the server can change (answering Accept: text/markdown,
					headers, the sitemap) comes as instructions.{" "}
					<Link href="/" className="text-accent underline underline-offset-2">
						Check a site
					</Link>
					.
				</p>
			</section>
		</main>
	);
}
