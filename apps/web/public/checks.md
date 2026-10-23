---
title: "What AgentCheck checks"
url: "https://agentcheck.dev/checks"
description: "Every check of the AgentCheck audit: what it looks at, when it passes, warns or fails, and the standard it rests on. 25 checks in 4 categories."
---

# What AgentCheck checks

25 checks in 4 categories, each based on a published standard. A full check also opens the page in a real browser and covers up to 10 pages of the site; every report looks for 13 agent protocols, and the fix files come from your own pages.

Each category scores 0 to 100 from its checks; the total weighs the categories. A warn counts half, a skipped check not at all. Without a browser the Agentic Actionability category is skipped and the others share its weight.

## AI Manifests 30% of the score

- ### llms.txt present
  `llms-txt`, about 10% of the score, once per site
  /llms.txt is published: a markdown table of contents for models.
  Pass
  It answers 200 with text, not an HTML page.
  Fail
  Missing, empty or served as HTML.
  [llmstxt.org](https://llmstxt.org/)
- ### llms.txt follows the llmstxt.org format
  `llms-txt-format`, about 5% of the score, once per site
  The structure of llms.txt: a title, a one-line summary and sections of links.
  Pass
  An H1 title, a summary blockquote and at least one section with a link list.
  Warn
  No summary blockquote.
  Fail
  No title or no link section, or no llms.txt to read.
  [llmstxt.org](https://llmstxt.org/)
- ### llms-full.txt present
  `llms-full-txt`, about 5% of the score, once per site
  /llms-full.txt is published: the site's content in one text file.
  Pass
  It answers 200 with text.
  Fail
  Missing, empty or served as HTML.
  [llmstxt.org](https://llmstxt.org/)
- ### Markdown version of the page
  `markdown-twin`, about 5% of the score
  The page has a markdown version an agent can find, which points back to the page.
  Pass
  Advertised with rel="alternate" type="text/markdown" \(tag or Link header\) and served with Link: rel="canonical", or served for Accept: text/markdown.
  Warn
  Found only at \<page>.md, or its response has no canonical Link header.
  Fail
  No markdown version.
  [llmstxt.org](https://llmstxt.org/) [RFC 8288 \(Link header\)](https://www.rfc-editor.org/rfc/rfc8288)
- ### Page links to llms.txt
  `llms-txt-link`, about 3% of the score
  The page links to /llms.txt, so an agent that lands on it finds the rest.
  Pass
  rel="describedby" to /llms.txt in a link tag or Link header.
  Fail
  No such link.
  Skipped
  When the site has no llms.txt.
  [RFC 8288 \(Link header\)](https://www.rfc-editor.org/rfc/rfc8288)
- ### Markdown on Accept: text/markdown
  `markdown-negotiation`, about 3% of the score
  Asked for the page with Accept: text/markdown, the server answers with markdown.
  Pass
  200 with Content-Type text/markdown and a markdown body.
  Fail
  HTML or an error instead.
  [RFC 9110: content negotiation](https://www.rfc-editor.org/rfc/rfc9110)

## Bot Access 20% of the score

- ### AI crawlers allowed
  `ai-bots-allowed`, about 8% of the score
  robots.txt lets the main AI crawlers \(GPTBot, ClaudeBot, PerplexityBot, Applebot-Extended, Google-Extended\) fetch the page.
  Pass
  Every one of them may fetch the page, or the site has no robots.txt.
  Warn
  Some of them are blocked, or robots.txt could not be read.
  Fail
  All of them are blocked.
  [RFC 9309 \(robots.txt\)](https://www.rfc-editor.org/rfc/rfc9309)
- ### No noai directives
  `noai-directives`, about 4% of the score
  The page does not opt out of AI use with noai or noimageai in the robots meta tag or the X-Robots-Tag header.
  Pass
  Neither directive is present.
  Warn
  noimageai only.
  Fail
  noai.
  [Google: robots meta tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- ### Page assets crawlable
  `asset-access`, about 1% of the score
  robots.txt does not block the page's images, scripts and stylesheets, which crawlers need to see the page as it is.
  Pass
  None of the page's assets is blocked.
  Warn
  Some are blocked.
  Skipped
  When robots.txt could not be read.
  [RFC 9309 \(robots.txt\)](https://www.rfc-editor.org/rfc/rfc9309)
- ### Content signals declared
  `content-signals`, about 3% of the score, once per site
  A Content-Signal in robots.txt or a page header says whether the content may be used for search, AI answers and AI training.
  Pass
  A signal is declared and allows search and AI input \(ai-train may be no\).
  Warn
  The signal opts out of search or AI input, names no known signal, or robots.txt could not be read.
  Fail
  No signal at all.
  [contentsignals.org](https://contentsignals.org/) [IETF draft: AI preferences](https://datatracker.ietf.org/doc/draft-romm-aipref-contentsignals/)
- ### Sitemap lists live pages
  `sitemap`, about 2% of the score, once per site
  A sitemap \(named in robots.txt, else /sitemap.xml\) lists the site's pages with their dates, so crawlers find them.
  Pass
  Every entry has a lastmod and every checked URL answers 200 \(up to 30, spread over the list\).
  Warn
  Entries without lastmod, or listed URLs that do not answer 200.
  Fail
  No sitemap, not a sitemap, or no page of this site in it.
  [sitemaps.org](https://www.sitemaps.org/protocol.html)
- ### Page may be shown and quoted
  `snippet-directives`, about 2% of the score
  Robots directives for all crawlers or AI crawlers do not keep the page out of search results and AI answers.
  Pass
  No noindex, none, nosnippet or snippet limit.
  Warn
  max-snippet limits, max-image-preview:none or data-nosnippet.
  Fail
  noindex, none or nosnippet.
  [Google: robots meta tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)

## Content \& Semantics 25% of the score

- ### Heading hierarchy
  `heading-hierarchy`, about 4% of the score
  Headings outline the page: one h1, then levels in order.
  Pass
  One h1 and no skipped levels.
  Warn
  More than one h1, or skipped levels.
  Fail
  No h1 \(or no headings at all\).
  [WAI tutorial: headings](https://www.w3.org/WAI/tutorials/page-structure/headings/)
- ### Structured data
  `structured-data`, about 4% of the score
  JSON-LD says in schema.org terms what the page is.
  Pass
  Usable schema.org JSON-LD.
  Warn
  Only microdata.
  Fail
  No structured data, or JSON-LD that cannot be used.
  [schema.org](https://schema.org/docs/gs.html) [Google: structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- ### OpenGraph tags
  `opengraph`, about 3% of the score
  OpenGraph tags give the page's title, description, image and URL.
  Pass
  og:title, og:description, og:image and og:url.
  Warn
  Some of them are missing.
  Fail
  None of them.
  [The Open Graph protocol](https://ogp.me/)
- ### Content density
  `content-density`, about 5% of the score
  The static HTML holds real main content, not mostly menus and footers.
  Pass
  150 words or more of main content, at least half of the page's text.
  Warn
  50 to 150 words, or main content under half of the text.
  Fail
  Under 50 words: the content needs JavaScript.
  [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- ### Canonical URL
  `canonical`, about 2% of the score
  The page names its preferred URL.
  Pass
  A rel="canonical" \(tag or Link header\) on this site that answers 200.
  Warn
  Invalid, more than one, another host, or a URL that does not answer 200.
  Fail
  No canonical URL.
  [Google: canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) [RFC 8288 \(Link header\)](https://www.rfc-editor.org/rfc/rfc8288)
- ### Meta description
  `meta-description`, about 2% of the score
  A meta description says in a sentence or two what the page is.
  Pass
  50 to 300 characters.
  Warn
  Shorter or longer.
  Fail
  Missing or empty.
  [Google: meta descriptions](https://developers.google.com/search/docs/appearance/snippet)
- ### Page language declared
  `html-lang`, about 2% of the score
  The page declares its language on \<html>.
  Pass
  A valid BCP 47 language tag.
  Warn
  A lang that is not a language tag.
  Fail
  No lang.
  [WCAG 3.1.1: language of page](https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html) [BCP 47](https://www.rfc-editor.org/info/bcp47)
- ### Code blocks name their language
  `code-languages`, about 2% of the score
  Code blocks say which language they are in, so an agent tells a command from its output.
  Pass
  Every code block names its language.
  Warn
  Some do.
  Fail
  None do.
  Skipped
  When the page has no code blocks.
  [HTML: the code element](https://html.spec.whatwg.org/multipage/text-level-semantics.html)
- ### Content without JavaScript
  `static-content`, about 2% of the score
  Most AI crawlers do not run JavaScript; the static HTML should carry the text the browser shows.
  Pass
  80% or more of the rendered main text is in the static HTML.
  Warn
  50 to 80%.
  Fail
  Under 50%.
  Skipped
  Without a browser \(a quick check or --no-browser\).
  [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)

## Agentic Actionability 25% of the score

- ### Accessible names
  `accessible-names`, about 10% of the score
  Links, buttons and fields have accessible names, the labels browser agents act on.
  Pass
  All of them are named.
  Warn
  Up to 10% are not.
  Fail
  More than 10% are not.
  Skipped
  Without a browser \(a quick check or --no-browser\).
  [MDN: accessible name](https://developer.mozilla.org/en-US/docs/Glossary/Accessible_name) [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)
- ### Click targets
  `click-targets`, about 6% of the score
  What can be clicked is a real button or link, not a bare div.
  Pass
  No click traps.
  Warn
  Up to 25% of click targets are not buttons or links.
  Fail
  More than 25%.
  Skipped
  Without a browser \(a quick check or --no-browser\).
  [WAI-ARIA APG: button](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
- ### Overlay blocking
  `overlay-blocking`, about 5% of the score
  Nothing covers the page on load \(cookie walls, popups\).
  Pass
  No element covers the centre or more than a third of the screen.
  Fail
  Something does.
  Skipped
  Without a browser \(a quick check or --no-browser\).
  [Google: intrusive interstitials](https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials)
- ### Captcha blocking
  `captcha-blocking`, about 4% of the score
  A plain page does not put a captcha in an agent's way.
  Pass
  No captcha.
  Warn
  A captcha that does not block the page.
  Fail
  A captcha or challenge page blocks it.
  Skipped
  Without a browser \(a quick check or --no-browser\).
  [W3C: Inaccessibility of CAPTCHA](https://www.w3.org/TR/turingtest/)

## Across the site

A full check audits up to 10 pages of the site: the ones in its sitemap, spread over it, else the links of its menu. The browser runs on the first page; the others get every check that needs none. Checks marked “once per site” run once and count for every page. The site score is the average of the pages that could be read; a page that cannot be read is listed with the reason. The command line does the same with --crawl, up to 50 pages.

## Agent protocols, not scored

Every report also looks for 13 documents a site may publish for agents beyond its content, and lists the ones it finds. They depend on what the site offers, so they never change the score.

### Agents and APIs

- MCP Server Card `/.well-known/mcp/server-card.json`
- A2A Agent Card `/.well-known/agent-card.json`
- Agent Skills index `/.well-known/agent-skills/index.json`
- API Catalog \(RFC 9727\) `/.well-known/api-catalog`
- OpenAPI description `/openapi.json`
- AI Catalog `/.well-known/ai-catalog.json`
- AGENTS.md `/AGENTS.md`

### Sign-in and keys

- OAuth / OpenID Connect discovery `/.well-known/oauth-authorization-server`
- OAuth Protected Resource \(RFC 9728\) `/.well-known/oauth-protected-resource`
- auth.md `/auth.md`
- Web Bot Auth key directory `/.well-known/http-message-signatures-directory`

### Commerce

- Universal Commerce Protocol profile `/.well-known/ucp`
- Agentic Commerce Protocol discovery `/.well-known/acp.json`

## What we do not check, and why

- Whether a crawler gets other content than a browser \(cloaking\): a made-up crawler user agent is blocked by bot protection that lets the real crawler in, so the answer would be wrong.
- sitemap.md, required AGENTS.md sections, a glossary link: no published standard defines them, and criteria we invent would make the audit less accurate. AGENTS.md is listed among the protocols when a site serves it.
- DNS-based agent discovery, and payment protocols that can only be guessed from an HTTP 402: the first needs lookups outside the site, the second would be guesswork.

## Fix files

For what a file can fix, the report builds it from the site's own pages: robots.txt, llms.txt, llms-full.txt, a markdown version of the page and head tags, plus a README and a prompt for a coding agent. What only the server can change \(answering Accept: text/markdown, headers, the sitemap\) comes as instructions. [Check a site](https://agentcheck.dev/).
