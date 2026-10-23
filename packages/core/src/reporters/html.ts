import { protocolsLine } from "../protocols-line.ts";
import type { AuditResult, CategoryResult, CheckResult } from "../types.ts";
import { HOMEPAGE } from "../version.ts";

const ENTITIES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

function esc(text: string): string {
	return text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

const MARKERS: Record<CheckResult["status"], string> = {
	pass: "✓",
	warn: "!",
	fail: "✗",
	skip: "–",
};

/**
 * Category identity colours (light, dark), the same steps as the web app's --cat-*
 * tokens: clear of the status colours and the brand. They colour a dot, never text.
 */
const CATEGORY_COLOURS: Record<CategoryResult["id"], [string, string]> = {
	"ai-manifests": ["#1fb8d1", "#1597b8"],
	"bot-access": ["#1d4fc4", "#3560da"],
	"content-semantics": ["#a074f2", "#9b74ee"],
	"agentic-actionability": ["#c9488c", "#cf4086"],
};

function categoryRules(scheme: 0 | 1): string {
	return Object.entries(CATEGORY_COLOURS)
		.map(([id, colours]) => `[data-category="${id}"]{--cat:${colours[scheme]}}`)
		.join("");
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f2f5;--card:#fff;--text:#1b1420;--muted:#6b5b66;--line:#dccfd8;--accent:#6e2a5e;--pass:#0b6b5a;--warn:#9a5c06;--fail:#b42318}
${categoryRules(0)}
@media (prefers-color-scheme: dark){:root{--bg:#141017;--card:#1c1620;--text:#eee6ec;--muted:#a0909c;--line:#2f2533;--accent:#dc92cc;--pass:#4fd1b0;--warn:#facc15;--fail:#f87171}${categoryRules(1)}}
*{box-sizing:border-box}
body{margin:0;padding:32px 16px;background:var(--bg);color:var(--text);font:16px/1.5 "Schibsted Grotesk",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;display:grid;gap:16px}
a{color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px}
header.card{padding:24px;display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.score{display:flex;align-items:baseline;gap:8px;color:var(--accent)}
.score strong{font-size:56px;line-height:1}
.grade{font-size:28px;font-weight:600}
.meta{flex:1;min-width:220px;color:var(--muted);font-size:14px;overflow-wrap:anywhere}
.meta h1{margin:0 0 4px;font-size:20px;color:var(--text)}
.meta p{margin:2px 0}
details.card summary{display:flex;justify-content:space-between;gap:16px;padding:16px 20px;cursor:pointer;font-weight:600}
details.card summary .score-line{color:var(--accent);font-weight:600}
details.card summary .skipped{color:var(--muted);font-weight:400}
details.card summary .title{display:flex;align-items:center;gap:10px}
.dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--cat)}
ul{list-style:none;margin:0;padding:0 20px 12px}
li.check{display:grid;grid-template-columns:20px 1fr;gap:4px 8px;padding:10px 0;border-top:1px solid var(--line)}
.mark{font-weight:700;text-align:center}
.pass .mark{color:var(--pass)}
.warn .mark{color:var(--warn)}
.fail .mark{color:var(--fail)}
.skip .mark,.skip .msg{color:var(--muted)}
.body{grid-column:2;color:var(--muted);font-size:14px;overflow-wrap:anywhere}
.body ul{padding:0;margin:4px 0 0}
.body li{padding:0}
.body p{margin:4px 0 0;color:var(--text)}
section.protocols{padding:16px 20px}
section.protocols h2{margin:0;font-size:16px;display:flex;justify-content:space-between;gap:16px}
section.protocols h2 span{color:var(--muted);font-weight:400}
section.protocols ul{padding:0;margin:8px 0 0}
section.protocols li{padding:8px 0;border-top:1px solid var(--line);overflow-wrap:anywhere}
section.protocols li span{display:block;color:var(--muted);font-size:14px}
section.protocols p{margin:8px 0 0;color:var(--muted);font-size:14px}
section.pages{padding:16px 20px}
section.pages h2{margin:0;font-size:16px;display:flex;justify-content:space-between;gap:16px}
section.pages h2 span{color:var(--muted);font-weight:400}
section.pages table{width:100%;border-collapse:collapse;margin-top:8px;font-size:14px}
section.pages td{padding:6px 8px 6px 0;border-top:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
section.pages td.num{width:48px;font-weight:600;color:var(--accent)}
section.pages td.failed{color:var(--fail)}
section.pages h3{margin:16px 0 4px;font-size:14px}
section.pages ul{padding:0;margin:0}
section.pages li{padding:4px 0;font-size:14px}
footer{text-align:center;color:var(--muted);font-size:14px}
`.trim();

function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

function renderCheck(check: CheckResult): string {
	const parts: string[] = [];
	if (check.status !== "skip") {
		const details = check.details ?? [];
		if (details.length > 0) {
			parts.push(
				`<ul>${details.map((detail) => `<li>${esc(detail)}</li>`).join("")}</ul>`,
			);
		}
		if (
			(check.status === "warn" || check.status === "fail") &&
			check.remediation
		) {
			parts.push(`<p>${esc(check.remediation)}</p>`);
		}
	}
	const body =
		parts.length > 0 ? `<div class="body">${parts.join("")}</div>` : "";
	return `<li class="check ${check.status}"><span class="mark" aria-hidden="true">${MARKERS[check.status]}</span><span class="msg">${esc(check.message)}</span>${body}</li>`;
}

function renderCategory(category: CategoryResult): string {
	const open = category.checks.some(
		(check) => check.status === "warn" || check.status === "fail",
	);
	const summary =
		category.status === "skipped"
			? `<span class="skipped">skipped: ${esc(category.skipReason)}</span>`
			: `<span class="score-line">${category.score}/100</span>`;
	return `<details class="card" data-category="${category.id}"${open ? " open" : ""}><summary><span class="title"><span class="dot"></span>${esc(category.title)}</span>${summary}</summary><ul>${category.checks.map(renderCheck).join("")}</ul></details>`;
}

function browserLine(browser: AuditResult["browser"]): string {
	if (!browser.used) return `Browser: not used — ${browser.reason}`;
	const seconds = (browser.renderMs / 1000).toFixed(1);
	return `Browser: ${browser.engine} ${browser.version} (rendered in ${seconds} s)`;
}

/** The crawl's pages (URLs as text: no links besides target and homepage) and the problems across them. */
function renderCrawl(crawl: AuditResult["crawl"]): string {
	if (!crawl) return "";
	const audited = crawl.pages.filter((p) => p.status === "audited").length;
	const rows = crawl.pages
		.map((page) =>
			page.status === "audited"
				? `<tr><td class="num">${page.score}</td><td class="num">${esc(page.grade)}</td><td>${esc(page.url)}</td></tr>`
				: `<tr><td class="num failed" colspan="2">failed</td><td>${esc(page.url)} (${esc(page.error)})</td></tr>`,
		)
		.join("");
	const issues = crawl.issues
		.map((issue) => {
			const counts = [
				issue.fail > 0 ? `fail on ${issue.fail}` : "",
				issue.warn > 0 ? `warn on ${issue.warn}` : "",
			]
				.filter(Boolean)
				.join(", ");
			return `<li>${esc(issue.title)}: ${counts} of ${audited} pages</li>`;
		})
		.join("");
	const problems = issues
		? `<h3>Problems across the pages</h3><ul>${issues}</ul>`
		: "";
	return `<section class="card pages"><h2>Pages<span>${audited} audited</span></h2><table>${rows}</table>${problems}</section>`;
}

/** Found protocols only, then one line for the rest; URLs stay text (no links besides target and homepage). */
function renderProtocols(protocols: AuditResult["protocols"]): string {
	if (!protocols) return "";
	const { checked, found } = protocols;
	const items = found
		.map((p) => `<li>${esc(p.title)}<span>${esc(p.url)}</span></li>`)
		.join("");
	const list = items ? `<ul>${items}</ul>` : "";
	return `<section class="card protocols"><h2>Agent protocols<span>not scored</span></h2>${list}<p>${esc(protocolsLine(checked.length, found.length))}</p></section>`;
}

export function renderHtml(result: AuditResult): string {
	const target = esc(result.target);
	const final =
		result.finalUrl !== result.target
			? `<p>Final URL: <a href="${esc(result.finalUrl)}">${esc(result.finalUrl)}</a></p>`
			: "";
	const version = esc(result.tool.version);
	const product = HOMEPAGE
		? `<a href="${esc(HOMEPAGE)}">AgentCheck</a>`
		: "AgentCheck";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AgentCheck report: ${esc(hostOf(result.target))}</title>
<style>
${STYLE}
</style>
</head>
<body>
<main>
<header class="card">
<div class="score"><strong>${result.crawl ? result.crawl.score : result.score}</strong><span>/ 100</span><span class="grade">${esc(result.crawl ? result.crawl.grade : result.grade)}</span></div>
<div class="meta">
<h1>${result.crawl ? "Site AI-readiness report" : "AI-readiness report"}</h1>
<p>Target: <a href="${target}">${target}</a></p>
${final}
${result.crawl ? `<p>${esc(`Average of ${result.crawl.pages.filter((p) => p.status === "audited").length} pages; this page ${result.score} (${result.grade}). Details below are for this page.`)}</p>` : ""}
<p>${esc(result.timestamp)}</p>
<p>${esc(browserLine(result.browser))}</p>
</div>
</header>
${result.categories.map(renderCategory).join("\n")}
${renderProtocols(result.protocols)}
${renderCrawl(result.crawl)}
<footer>${product} v${version}</footer>
</main>
</body>
</html>
`;
}
