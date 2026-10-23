# AgentCheck — Specification

A CLI and a web service that audit how ready a website is for AI agents,
search LLMs and autonomous browsers.

## 1. Architecture and stack

- **Engine / CLI:** Node.js / TypeScript.
- **HTTP / scanning:** `undici` / native `fetch` for static files; `playwright-core` (headless Chromium) for the browser checks.
- **DOM parsing:** `cheerio` for static HTML analysis without a browser.
- **Output formats:**
  - **Terminal:** a coloured, formatted log.
  - **JSON:** the machine-readable result (`AuditResult`) for CI.
  - **HTML:** a single-file report (inline CSS, no scripts).

## 2. Check matrix

Four categories; the total score is 0–100 with a grade from A+ to F.

| Category | Weight | Checks |
|---|---|---|
| AI Manifests | 30% | `/llms.txt` present (`llms-txt`) and in the llmstxt.org format (`llms-txt-format`); `/llms-full.txt` present (`llms-full-txt`); a markdown twin of the page that an agent can discover: advertised with `rel="alternate" type="text/markdown"` in a link tag or a `Link` header, or served for `Accept: text/markdown` (one found only at `<page>.md` warns) (`markdown-twin`); the page links to `/llms.txt` with `rel="describedby"` (`llms-txt-link`, skipped without an llms.txt); the page answers `Accept: text/markdown` with markdown (`markdown-negotiation`). |
| Bot Access | 20% | robots.txt does not block the key AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Applebot-Extended, Google-Extended) from the page (`ai-bots-allowed`); no `noai`/`noimageai` directives (`noai-directives`); robots.txt does not block the page's images, scripts and stylesheets (`asset-access`); a `Content-Signal` (contentsignals.org) in robots.txt or the page's headers that does not opt out of `search` or `ai-input` (`content-signals`); a sitemap (robots.txt `Sitemap:` lines on the site's host, else `/sitemap.xml`, an index followed one level) whose entries all have `<lastmod>` and whose listed URLs answer 200 (up to 30 checked, spread over the list, the whole check within 20 s) (`sitemap`); no `noindex`/`none`/`nosnippet` for robots or an AI crawler in the robots meta tag or `X-Robots-Tag` (fail), no `max-snippet` limit, `max-image-preview:none` or `data-nosnippet` (warn) (`snippet-directives`). |
| Content & Semantics | 25% | heading hierarchy (`heading-hierarchy`), JSON-LD / schema.org (`structured-data`), OpenGraph (`opengraph`), main content versus boilerplate (`content-density`), a canonical URL that answers 200 on the site (`canonical`), a meta description of 50–300 characters (`meta-description`), a valid `lang` on `<html>` (`html-lang`). |
| Agentic Actionability | 25% | accessible names on interactive elements (`accessible-names`), click targets that are real buttons or links (`click-targets`), nothing covering the page on load (`overlay-blocking`), no captcha on a plain page (`captcha-blocking`). Needs a browser; without one the category is skipped. |

## 3. Command-line interface

```bash
# Page audit (terminal report)
npx agentcheck-dev https://example.com

# Single-file HTML report to stdout
npx agentcheck-dev https://example.com --format=html > agentcheck-report.html

# CI: fail the build below the threshold; stdout is the JSON only
npx agentcheck-dev https://example.com --threshold=85 --format=json
```

Options: `--threshold=N`, `--format=terminal|json|html`, `--user-agent=STRING`
(env `AGENTCHECK_USER_AGENT`), `--no-browser`, `-h`, `-v`. `--crawl`, `--limit`,
`--output` and `--report-dir` are refused with a "not implemented" message.

Exit codes are a CI contract: 0 done, 1 score below `--threshold`, 2 usage or
fatal error (including an unreachable target).

Fix files from the command line:

```bash
# Audit, then write the files that fix what was found into ./agentcheck-fix
npx agentcheck-dev fix https://example.com

# Only an llms.txt and llms-full.txt, into ./out (skips the audit)
npx agentcheck-dev fix https://example.com --only=llms,llms-full --out=./out
```

Options: `--out=DIR` (default `./agentcheck-fix`), `--only=KINDS` (comma-separated
from `robots`, `llms`, `llms-full`, `markdown`, `head`; skips the audit),
`--force` (overwrite existing files; without it nothing is overwritten),
`--user-agent=STRING` (env `AGENTCHECK_USER_AGENT`), `-h`. Besides the files it
writes `README.md` and `AGENT-PROMPT.md`. Exit code: 2 on usage errors, unknown
kinds, refused overwrites or other errors; 0 otherwise, including "Nothing to fix".

Example terminal output:

```text
 AgentCheck v0.x — AI-Readiness Audit
 Target: https://example.com

 [✓] AI Manifests          100/100
     ✓ /llms.txt found and valid
     ✓ /llms-full.txt reachable
     ✓ Markdown twins advertised (<link rel="alternate">)

 [✓] Bot Access             100/100
     ✓ robots.txt allows GPTBot, ClaudeBot, PerplexityBot

 [!] Content & Semantics     92/100
     ✓ Schema.org metadata found
     ⚠ Heading skip detected (h2 -> h4)

 [✓] Agentic Actionability  100/100
     ✓ All interactive targets have accessible names
     ✓ 0 click-interception traps

 ──────────────────────────────────────────────
 OVERALL AI SCORE: 98 / 100 [A+]
```

## 4. Artifact generators

- AI Ready badge (`AI Ready: 98/100`, SVG for a README or site footer): served by
  the web service for shared reports (`/api/shared/[token]/badge.svg`), not by the CLI.
- Fix files (`robots.txt`, `llms.txt`, `llms-full.txt`, a markdown twin of the audited page,
  `head.html`, README, agent prompt): built from the site's own pages
  (`@agentcheck/core/fixes`) by the web service on request for the owner of a finished
  audit (plus zip), and by the CLI as `agentcheck fix <url>`, which writes a directory.

## 5. Web service

The hosted service at https://agentcheck.dev (web app, worker, PostgreSQL queue)
runs the same engine with the network guard on, stores audits, history and share
links, adds a first-screen screenshot and the site's favicon to each report, and
lets the owner generate fix files (section 4). Rules: `CLAUDE.md`; deploy:
`docs/deploy.md`.
