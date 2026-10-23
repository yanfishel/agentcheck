/**
 * What each check looks at, when it passes, warns or fails, and the published
 * standard or documentation it rests on. The web service's /checks page is
 * built from this and the registry; a test keeps the two in step, so a new
 * check needs its entry here. A plain module: no network imports.
 */
export interface CheckDoc {
	/** One sentence: what the check looks at and why it matters to agents. */
	summary: string;
	pass: string;
	warn?: string;
	fail?: string;
	/** When the check is skipped instead of scored. */
	skip?: string;
	sources: { label: string; href: string }[];
}

const RFC_9309 = {
	label: "RFC 9309 (robots.txt)",
	href: "https://www.rfc-editor.org/rfc/rfc9309",
};
const LLMSTXT = { label: "llmstxt.org", href: "https://llmstxt.org/" };
const RFC_8288 = {
	label: "RFC 8288 (Link header)",
	href: "https://www.rfc-editor.org/rfc/rfc8288",
};
const ROBOTS_META = {
	label: "Google: robots meta tag",
	href: "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag",
};
const NO_BROWSER = "Without a browser (a quick check or --no-browser).";

export const CHECK_DOCS: Record<string, CheckDoc> = {
	"ai-bots-allowed": {
		summary:
			"robots.txt lets the main AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Applebot-Extended, Google-Extended) fetch the page.",
		pass: "Every one of them may fetch the page, or the site has no robots.txt.",
		warn: "Some of them are blocked, or robots.txt could not be read.",
		fail: "All of them are blocked.",
		sources: [RFC_9309],
	},
	"noai-directives": {
		summary:
			"The page does not opt out of AI use with noai or noimageai in the robots meta tag or the X-Robots-Tag header.",
		pass: "Neither directive is present.",
		warn: "noimageai only.",
		fail: "noai.",
		sources: [ROBOTS_META],
	},
	"asset-access": {
		summary:
			"robots.txt does not block the page's images, scripts and stylesheets, which crawlers need to see the page as it is.",
		pass: "None of the page's assets is blocked.",
		warn: "Some are blocked.",
		skip: "When robots.txt could not be read.",
		sources: [RFC_9309],
	},
	"content-signals": {
		summary:
			"A Content-Signal in robots.txt or a page header says whether the content may be used for search, AI answers and AI training.",
		pass: "A signal is declared and allows search and AI input (ai-train may be no).",
		warn: "The signal opts out of search or AI input, names no known signal, or robots.txt could not be read.",
		fail: "No signal at all.",
		sources: [
			{ label: "contentsignals.org", href: "https://contentsignals.org/" },
			{
				label: "IETF draft: AI preferences",
				href: "https://datatracker.ietf.org/doc/draft-romm-aipref-contentsignals/",
			},
		],
	},
	sitemap: {
		summary:
			"A sitemap (named in robots.txt, else /sitemap.xml) lists the site's pages with their dates, so crawlers find them.",
		pass: "Every entry has a lastmod and every checked URL answers 200 (up to 30, spread over the list).",
		warn: "Entries without lastmod, or listed URLs that do not answer 200.",
		fail: "No sitemap, not a sitemap, or no page of this site in it.",
		sources: [
			{ label: "sitemaps.org", href: "https://www.sitemaps.org/protocol.html" },
		],
	},
	"snippet-directives": {
		summary:
			"Robots directives for all crawlers or AI crawlers do not keep the page out of search results and AI answers.",
		pass: "No noindex, none, nosnippet or snippet limit.",
		warn: "max-snippet limits, max-image-preview:none or data-nosnippet.",
		fail: "noindex, none or nosnippet.",
		sources: [ROBOTS_META],
	},
	"llms-txt": {
		summary: "/llms.txt is published: a markdown table of contents for models.",
		pass: "It answers 200 with text, not an HTML page.",
		fail: "Missing, empty or served as HTML.",
		sources: [LLMSTXT],
	},
	"llms-txt-format": {
		summary:
			"The structure of llms.txt: a title, a one-line summary and sections of links.",
		pass: "An H1 title, a summary blockquote and at least one section with a link list.",
		warn: "No summary blockquote.",
		fail: "No title or no link section, or no llms.txt to read.",
		sources: [LLMSTXT],
	},
	"llms-full-txt": {
		summary:
			"/llms-full.txt is published: the site's content in one text file.",
		pass: "It answers 200 with text.",
		fail: "Missing, empty or served as HTML.",
		sources: [LLMSTXT],
	},
	"markdown-twin": {
		summary:
			"The page has a markdown version an agent can find, which points back to the page.",
		pass: 'Advertised with rel="alternate" type="text/markdown" (tag or Link header) and served with Link: rel="canonical", or served for Accept: text/markdown.',
		warn: "Found only at <page>.md, or its response has no canonical Link header.",
		fail: "No markdown version.",
		sources: [LLMSTXT, RFC_8288],
	},
	"llms-txt-link": {
		summary:
			"The page links to /llms.txt, so an agent that lands on it finds the rest.",
		pass: 'rel="describedby" to /llms.txt in a link tag or Link header.',
		fail: "No such link.",
		skip: "When the site has no llms.txt.",
		sources: [RFC_8288],
	},
	"markdown-negotiation": {
		summary:
			"Asked for the page with Accept: text/markdown, the server answers with markdown.",
		pass: "200 with Content-Type text/markdown and a markdown body.",
		fail: "HTML or an error instead.",
		sources: [
			{
				label: "RFC 9110: content negotiation",
				href: "https://www.rfc-editor.org/rfc/rfc9110#name-content-negotiation",
			},
		],
	},
	"heading-hierarchy": {
		summary: "Headings outline the page: one h1, then levels in order.",
		pass: "One h1 and no skipped levels.",
		warn: "More than one h1, or skipped levels.",
		fail: "No h1 (or no headings at all).",
		sources: [
			{
				label: "WAI tutorial: headings",
				href: "https://www.w3.org/WAI/tutorials/page-structure/headings/",
			},
		],
	},
	"structured-data": {
		summary: "JSON-LD says in schema.org terms what the page is.",
		pass: "Usable schema.org JSON-LD.",
		warn: "Only microdata.",
		fail: "No structured data, or JSON-LD that cannot be used.",
		sources: [
			{ label: "schema.org", href: "https://schema.org/docs/gs.html" },
			{
				label: "Google: structured data",
				href: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
			},
		],
	},
	opengraph: {
		summary:
			"OpenGraph tags give the page's title, description, image and URL.",
		pass: "og:title, og:description, og:image and og:url.",
		warn: "Some of them are missing.",
		fail: "None of them.",
		sources: [{ label: "The Open Graph protocol", href: "https://ogp.me/" }],
	},
	"content-density": {
		summary:
			"The static HTML holds real main content, not mostly menus and footers.",
		pass: "150 words or more of main content, at least half of the page's text.",
		warn: "50 to 150 words, or main content under half of the text.",
		fail: "Under 50 words: the content needs JavaScript.",
		sources: [
			{
				label: "Google: JavaScript SEO basics",
				href: "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
			},
		],
	},
	canonical: {
		summary: "The page names its preferred URL.",
		pass: 'A rel="canonical" (tag or Link header) on this site that answers 200.',
		warn: "Invalid, more than one, another host, or a URL that does not answer 200.",
		fail: "No canonical URL.",
		sources: [
			{
				label: "Google: canonical URLs",
				href: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
			},
			RFC_8288,
		],
	},
	"meta-description": {
		summary: "A meta description says in a sentence or two what the page is.",
		pass: "50 to 300 characters.",
		warn: "Shorter or longer.",
		fail: "Missing or empty.",
		sources: [
			{
				label: "Google: meta descriptions",
				href: "https://developers.google.com/search/docs/appearance/snippet",
			},
		],
	},
	"html-lang": {
		summary: "The page declares its language on <html>.",
		pass: "A valid BCP 47 language tag.",
		warn: "A lang that is not a language tag.",
		fail: "No lang.",
		sources: [
			{
				label: "WCAG 3.1.1: language of page",
				href: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html",
			},
			{ label: "BCP 47", href: "https://www.rfc-editor.org/info/bcp47" },
		],
	},
	"code-languages": {
		summary:
			"Code blocks say which language they are in, so an agent tells a command from its output.",
		pass: "Every code block names its language.",
		warn: "Some do.",
		fail: "None do.",
		skip: "When the page has no code blocks.",
		sources: [
			{
				label: "HTML: the code element",
				href: "https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-code-element",
			},
		],
	},
	"static-content": {
		summary:
			"Most AI crawlers do not run JavaScript; the static HTML should carry the text the browser shows.",
		pass: "80% or more of the rendered main text is in the static HTML.",
		warn: "50 to 80%.",
		fail: "Under 50%.",
		skip: NO_BROWSER,
		sources: [
			{
				label: "Google: JavaScript SEO basics",
				href: "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
			},
		],
	},
	"accessible-names": {
		summary:
			"Links, buttons and fields have accessible names, the labels browser agents act on.",
		pass: "All of them are named.",
		warn: "Up to 10% are not.",
		fail: "More than 10% are not.",
		skip: NO_BROWSER,
		sources: [
			{
				label: "MDN: accessible name",
				href: "https://developer.mozilla.org/en-US/docs/Glossary/Accessible_name",
			},
			{ label: "WAI-ARIA APG", href: "https://www.w3.org/WAI/ARIA/apg/" },
		],
	},
	"click-targets": {
		summary: "What can be clicked is a real button or link, not a bare div.",
		pass: "No click traps.",
		warn: "Up to 25% of click targets are not buttons or links.",
		fail: "More than 25%.",
		skip: NO_BROWSER,
		sources: [
			{
				label: "WAI-ARIA APG: button",
				href: "https://www.w3.org/WAI/ARIA/apg/patterns/button/",
			},
		],
	},
	"overlay-blocking": {
		summary: "Nothing covers the page on load (cookie walls, popups).",
		pass: "No element covers the centre or more than a third of the screen.",
		fail: "Something does.",
		skip: NO_BROWSER,
		sources: [
			{
				label: "Google: intrusive interstitials",
				href: "https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials",
			},
		],
	},
	"captcha-blocking": {
		summary: "A plain page does not put a captcha in an agent's way.",
		pass: "No captcha.",
		warn: "A captcha that does not block the page.",
		fail: "A captcha or challenge page blocks it.",
		skip: NO_BROWSER,
		sources: [
			{
				label: "W3C: Inaccessibility of CAPTCHA",
				href: "https://www.w3.org/TR/turingtest/",
			},
		],
	},
};
