# agentcheck

Audit how ready a website is for AI agents, search LLMs and autonomous
browsers, and write the files that fix it. The same engine runs
[agentcheck.dev](https://agentcheck.dev).

```sh
npx agentcheck https://your-site.com
```

Requires Node.js 22.18 or newer. Browser checks use an installed Google Chrome
or a Playwright Chromium (`npx playwright install chromium`); AgentCheck never
downloads a browser itself.

## Audit

```sh
npx agentcheck https://your-site.com                          # terminal report
npx agentcheck https://your-site.com --format=html > report.html
npx agentcheck https://your-site.com --threshold=85 --format=json   # CI
```

| Option | |
|---|---|
| `--format=terminal\|json\|html` | Output format (default `terminal`). `json` prints only the result JSON. |
| `--threshold=N` | Exit non-zero when the score is below `N`. |
| `--no-browser` | Skip the browser checks. |
| `--user-agent=STRING` | User-Agent for every request (env `AGENTCHECK_USER_AGENT`). |
| `-h`, `-v` | Help, version. |

Four categories, one score from 0 to 100 and a grade from A+ to F:

| Category | Weight |
|---|---|
| AI manifests: `llms.txt`, `llms-full.txt`, markdown twins | 30% |
| Bot access: `robots.txt` for AI crawlers, `noai` tags | 20% |
| Content and semantics: content density, headings, OpenGraph, JSON-LD | 25% |
| Agentic actionability: accessible names, click traps, captchas | 25% |

## Fix

```sh
npx agentcheck fix https://your-site.com
```

Writes `robots.txt`, `llms.txt`, `llms-full.txt`, a markdown version of the page
and `head.html`, built from your own pages, plus `README.md` (where each file
goes) and `AGENT-PROMPT.md` (a task to hand to Cursor, Claude Code or another
coding agent) into `./agentcheck-fix`.

| Option | |
|---|---|
| `--out=DIR` | Output directory (default `./agentcheck-fix`). |
| `--only=KINDS` | Comma-separated from `robots`, `llms`, `llms-full`, `markdown`, `head`; skips the audit. |
| `--force` | Overwrite existing files (never done without it). |
| `--user-agent=STRING` | As above. |

Exit code 2 on usage errors, unknown kinds, refused overwrites or other errors;
0 otherwise, including "Nothing to fix".

## Links

[agentcheck.dev](https://agentcheck.dev) ·
[Source](https://github.com/yanfishel/agentcheck) ·
[Issues](https://github.com/yanfishel/agentcheck/issues) · MIT licence
