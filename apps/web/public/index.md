# Is your site ready for AI agents?

People ask ChatGPT, Claude and Perplexity what they used to google. Check whether those assistants can read your site, quote it and link to it. It takes under a minute.

Check a site at https://agentcheck.dev: paste a URL and choose **Quick** (no browser, no account) or **Full check** (adds browser-based checks and up to 10 pages of the site; needs a free account).

## What an AI reads before it reads you

An AI answer cites a handful of sources. Four things decide whether your site can be one of them, and the score weighs them like this.

### llms.txt is a table of contents for models

Weight: 30% of the score (AI Manifests). A plain markdown file at the root that points to your important pages, plus markdown versions of those pages that a page links to and serves to agents that ask for markdown. *A young standard, and ten minutes of work.* See [llmstxt.org](https://llmstxt.org/) and [RFC 8288 (Link)](https://www.rfc-editor.org/rfc/rfc8288).

### robots.txt says who may come in

Weight: 20% (Bot Access). AI crawlers have their own names and obey robots.txt, which can now also say what they may do with your pages. Plenty of sites block them by accident with a rule copied years ago, or hide pages with a stray noindex, and a sitemap with dead links sends them nowhere. *Your old robots.txt may not be a fan of ChatGPT.* See [OpenAI crawlers](https://developers.openai.com/api/docs/bots), [ClaudeBot](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), [PerplexityBot](https://docs.perplexity.ai/docs/resources/perplexity-crawlers), [Google-Extended](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers), [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309), [contentsignals.org](https://contentsignals.org/) and [sitemaps.org](https://www.sitemaps.org/protocol.html).

### Structure tells it what the page is

Weight: 25% (Content & Semantics). One h1, headings in order, a canonical URL, a description and a language, JSON-LD and OpenGraph, and real content in the HTML itself, not only after JavaScript runs. See [schema.org](https://schema.org/docs/gs.html), [Google structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data), [Open Graph](https://ogp.me/) and [Google canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

### Buttons with names let agents act

Weight: 25% (Agentic Actionability). Browser agents book, buy and fill in forms. A div that pretends to be a button, or a captcha on a plain page, stops them. *Agents cannot click on vibes.* See [MDN: accessible name](https://developer.mozilla.org/en-US/docs/Glossary/Accessible_name) and [WAI-ARIA practices](https://www.w3.org/WAI/ARIA/apg/).

25 checks in 4 categories, each based on a published standard. A full check also opens the page in a real browser and covers up to 10 pages of the site; every report looks for 13 agent protocols, and the fix files come from your own pages. [See every check](https://agentcheck.dev/checks).

## How it works

1. **Paste a URL.** Start from any public page. We read it along with the site's robots.txt and llms.txt.
2. **We run the checks.** Quick reads your pages without a browser. Full also renders them in Chromium and needs an account.
3. **Fix what matters.** Every failed check comes with a remediation and, where possible, a snippet to copy.

## Example report

A saved audit of vite.dev, shown the way you will see your own.

### vite.dev

Site score 80 of 100, grade B: the average of 10 pages (full check, Chrome). The home page itself scores 76, grade C. Its categories:

- AI Manifests: 75/100, 2 fails (no markdown version of the page, no markdown answer to Accept: text/markdown)
- Bot Access: 77/100, 1 fail (no content signals), 2 warnings (sitemap entries without lastmod, a limit on what answers may quote)
- Content & Semantics: 73/100, 2 warnings (heading levels skip, a short meta description), 1 fail (no structured data)
- Agentic Actionability: 80/100, 1 warning (one link without an accessible name)

Across the 10 pages, every one lacks structured data and a markdown answer to Accept: text/markdown.

## Fair questions

### Is this just SEO with a new name?

Partly. Good SEO helps, but AI crawlers have their own names in robots.txt, their own files to read, and agents that try to press your buttons. Classic SEO tools do not look at any of that.

### Should I let every AI bot in?

That is your call. Some sites block training crawlers and allow search ones. The report shows what is open and what is closed, so it is a decision rather than an accident.

### How do you decide what to check?

Every check rests on a published standard or documented practice: RFCs, llmstxt.org, schema.org, WCAG, the search engines' own guides. Where no standard exists we leave the thing out rather than invent a rule. The full list, with each rule and its source, is on the checks page.

### Does llms.txt really work?

Not every assistant reads it yet. It is a small markdown file that takes minutes to write, so we count it and show you what to put in it.

### Will a perfect score get me into ChatGPT answers?

No tool can promise that, and anyone who does is selling something. A good score means nothing on your side is in the way.

## Command line and CI

The CLI runs the same engine. Fail the build when the score drops.

```sh
npx agentcheck-dev https://your-site.com
npx agentcheck-dev https://your-site.com --threshold=85 --format=json   # in CI
npx agentcheck-dev fix https://your-site.com   # write the files that fix it
```

The CLI is [agentcheck-dev on npm](https://www.npmjs.com/package/agentcheck-dev); the source is at https://github.com/yanfishel/agentcheck (MIT).

## Badge

Share a report and show the score in your README:

```md
## Status

[![AI Ready: 80/100](<badge url>)](<report url>)
```

## Check your site now

A quick check is free, needs no account and takes under a minute: https://agentcheck.dev
