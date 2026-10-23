# Is your site ready for AI agents?

People ask ChatGPT, Claude and Perplexity what they used to google. Check whether those assistants can read your site, quote it and link to it. It takes under a minute.

Check a site at https://agentcheck.dev: paste a URL and choose **Quick** (no browser, no account) or **Full check** (adds browser-based checks and up to 10 pages of the site; needs a free account).

## What an AI reads before it reads you

An AI answer cites a handful of sources. Four things decide whether your site can be one of them, and the score weighs them like this.

### llms.txt is a table of contents for models

Weight: 30% of the score (AI Manifests). A plain markdown file at the root that points to your important pages, plus markdown versions of those pages. *A young standard, and ten minutes of work.* See [llmstxt.org](https://llmstxt.org/).

### robots.txt says who may come in

Weight: 20% (Bot Access). AI crawlers have their own names and obey robots.txt. Plenty of sites block them by accident with a rule copied years ago. *Your old robots.txt may not be a fan of ChatGPT.* See [OpenAI crawlers](https://developers.openai.com/api/docs/bots), [ClaudeBot](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), [PerplexityBot](https://docs.perplexity.ai/docs/resources/perplexity-crawlers), [Google-Extended](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers) and [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309).

### Structure tells it what the page is

Weight: 25% (Content & Semantics). One h1, headings in order, JSON-LD and OpenGraph, and more real content than menus and footers. See [schema.org](https://schema.org/docs/gs.html), [Google structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) and [Open Graph](https://ogp.me/).

### Buttons with names let agents act

Weight: 25% (Agentic Actionability). Browser agents book, buy and fill in forms. A div that pretends to be a button, or a captcha on a plain page, stops them. *Agents cannot click on vibes.* See [MDN: accessible name](https://developer.mozilla.org/en-US/docs/Glossary/Accessible_name) and [WAI-ARIA practices](https://www.w3.org/WAI/ARIA/apg/).

## How it works

1. **Paste a URL.** Start from any public page. We read it along with the site's robots.txt and llms.txt.
2. **We run the checks.** Quick reads your pages without a browser. Full also renders them in Chromium and needs an account.
3. **Fix what matters.** Every failed check comes with a remediation and, where possible, a snippet to copy.

## Example report

A saved audit of vite.dev, shown the way you will see your own.

### vite.dev

Overall score 80 of 100, grade B (full check, Chrome). By category:

- AI Manifests: 80/100, 1 fail (no markdown version of the page)
- Bot Access: 100/100
- Content & Semantics: 63/100, 1 warning (heading levels skip), 1 fail (no structured data)
- Agentic Actionability: 80/100, 1 warning (one link without an accessible name)

## Fair questions

### Is this just SEO with a new name?

Partly. Good SEO helps, but AI crawlers have their own names in robots.txt, their own files to read, and agents that try to press your buttons. Classic SEO tools do not look at any of that.

### Should I let every AI bot in?

That is your call. Some sites block training crawlers and allow search ones. The report shows what is open and what is closed, so it is a decision rather than an accident.

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
