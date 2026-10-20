import type { CheerioAPI } from "cheerio";
import { normaliseLink } from "./extract.ts";
import { cleanText, escapeMarkdown } from "./text.ts";

/** Upper bound for one page's markdown, in UTF-8 bytes. */
export const PAGE_MARKDOWN_MAX = 100 * 1024;

const CUT_MARKER = "<!-- AgentCheck: page cut at 100 KB -->";
const BACKSLASH = String.fromCharCode(92);

/** The parts of a domhandler node this converter reads. */
interface DomNode {
	type: string;
	data?: string;
	name?: string;
	attribs?: Record<string, string>;
	children?: DomNode[];
}

const DROPPED = new Set([
	"script",
	"style",
	"noscript",
	"template",
	"svg",
	"canvas",
	"iframe",
	"form",
	"button",
	"input",
	"select",
	"textarea",
]);
const CHROME = new Set(["nav", "header", "footer", "aside"]);
const INLINE = new Set([
	"a",
	"abbr",
	"b",
	"bdi",
	"bdo",
	"br",
	"cite",
	"code",
	"data",
	"del",
	"dfn",
	"em",
	"font",
	"i",
	"img",
	"ins",
	"kbd",
	"label",
	"mark",
	"q",
	"s",
	"samp",
	"small",
	"span",
	"strong",
	"sub",
	"sup",
	"time",
	"u",
	"var",
	"wbr",
]);
const HEADING = /^h([1-6])$/;
const WHITESPACE = /[ \t\r\n\f]+/g;

interface Ctx {
	/** Body fallback: page chrome (nav, header, footer, aside) is skipped too. */
	chrome: boolean;
	base: URL;
	/** Elements nested deeper than MAX_DEPTH: skipped so the walk stays bounded. */
	tooDeep: Set<DomNode>;
}

/** Content nested deeper than this many elements under the root is ignored. */
const MAX_DEPTH = 500;

/** Elements at exactly MAX_DEPTH below the root (found without recursion). */
function deepElements(root: DomNode): Set<DomNode> {
	const deep = new Set<DomNode>();
	const stack: Array<[DomNode, number]> = [[root, 0]];
	for (let entry = stack.pop(); entry; entry = stack.pop()) {
		const [node, depth] = entry;
		if (depth >= MAX_DEPTH) {
			deep.add(node);
			continue;
		}
		for (const child of node.children ?? []) stack.push([child, depth + 1]);
	}
	return deep;
}

function isElement(node: DomNode): boolean {
	return (
		(node.type === "tag" || node.type === "script" || node.type === "style") &&
		typeof node.name === "string"
	);
}

function tagName(node: DomNode): string {
	return node.name?.toLowerCase() ?? "";
}

function attr(node: DomNode, name: string): string | undefined {
	return node.attribs?.[name];
}

function isSkipped(node: DomNode, ctx: Ctx): boolean {
	const name = tagName(node);
	if (DROPPED.has(name) || ctx.tooDeep.has(node)) return true;
	if (attr(node, "hidden") !== undefined) return true;
	if (attr(node, "aria-hidden")?.trim().toLowerCase() === "true") return true;
	if (!ctx.chrome) return false;
	if (CHROME.has(name)) return true;
	return attr(node, "role")?.trim().toLowerCase() === "navigation";
}

/** Raw text of a subtree (used for pre and code). */
function rawText(node: DomNode, ctx: Ctx): string {
	if (ctx.tooDeep.has(node)) return "";
	if (node.type === "text") return node.data ?? "";
	if (!isElement(node) || DROPPED.has(tagName(node))) return "";
	if (tagName(node) === "br") return "\n";
	return (node.children ?? []).map((child) => rawText(child, ctx)).join("");
}

/** Drops control characters except newline and tab. */
function stripControl(value: string): string {
	return Array.from(value, (char) => {
		if (char === "\n" || char === "\t") return char;
		const code = char.codePointAt(0) ?? 0;
		return code < 32 || (code >= 127 && code < 160) ? "" : char;
	}).join("");
}

function isSpace(char: string | undefined): boolean {
	return char === " " || char === "\n" || char === "\t" || char === "\r";
}

/** Longest run of backticks in a string. */
function longestTicks(value: string): number {
	let best = 0;
	let run = 0;
	for (const char of value) {
		run = char === "`" ? run + 1 : 0;
		if (run > best) best = run;
	}
	return best;
}

/** Escapes a block marker (# > - + * = ` ~ or "1.") at the start of a line of text. */
function escapeLineStart(text: string): string {
	let at = 0;
	while (isSpace(text[at])) at++;
	const char = text[at];
	if (char === undefined) return text;
	if ("#>-+*=`~".includes(char)) {
		return text.slice(0, at) + BACKSLASH + text.slice(at);
	}
	let end = at;
	while (
		end < text.length &&
		(text[end] ?? "") >= "0" &&
		(text[end] ?? "") <= "9"
	) {
		end++;
	}
	if (end > at && (text[end] === "." || text[end] === ")")) {
		return text.slice(0, end) + BACKSLASH + text.slice(end);
	}
	return text;
}

/** Link destination safe inside ( ): parentheses and backslashes percent-encoded. */
function destination(url: URL): string {
	return url.href
		.replaceAll(BACKSLASH, "%5C")
		.replaceAll("(", "%28")
		.replaceAll(")", "%29");
}

/** Absolute http(s) URL of a link or image; in-page anchors and other schemes give null. */
function resolveHref(href: string | undefined, base: URL): URL | null {
	const value = href?.trim();
	if (!value || value.startsWith("#")) return null;
	return normaliseLink(value, base);
}

/** Tidies inline output: one space between words, trimmed lines, no empty lines. */
function finishInline(raw: string): string {
	return raw
		.split("\n")
		.map((line) => line.replace(/ {2,}/g, " ").trim())
		.filter(Boolean)
		.join("\n");
}

/** Accumulates inline markdown from text and phrasing elements. */
class InlineWriter {
	out = "";
	/** True while the current line holds nothing but spaces. */
	private lineBlank = true;
	private readonly ctx: Ctx;

	constructor(ctx: Ctx) {
		this.ctx = ctx;
	}

	private append(value: string) {
		this.out += value;
		const lastBreak = value.lastIndexOf("\n");
		const tail = lastBreak === -1 ? value : value.slice(lastBreak + 1);
		this.lineBlank = (lastBreak !== -1 || this.lineBlank) && tail.trim() === "";
	}

	text(data: string) {
		const flat = stripControl(data).replace(WHITESPACE, " ");
		if (!flat) return;
		const escaped = escapeMarkdown(flat);
		this.append(this.lineBlank ? escapeLineStart(escaped) : escaped);
	}

	node(node: DomNode) {
		if (node.type === "text") return this.text(node.data ?? "");
		if (!isElement(node) || isSkipped(node, this.ctx)) return;
		switch (tagName(node)) {
			case "br":
				this.append("\n");
				return;
			case "strong":
			case "b":
				return this.wrap(node, "**");
			case "em":
			case "i":
				return this.wrap(node, "*");
			case "code":
				return this.code(node);
			case "a":
				return this.link(node);
			case "img":
				return this.image(node);
		}
		const block = !INLINE.has(tagName(node));
		if (block) this.append(" ");
		for (const child of node.children ?? []) this.node(child);
		if (block) this.append(" ");
	}

	/** Renders children in a fresh writer; edge spaces stay outside the markup. */
	private inner(node: DomNode) {
		const sub = new InlineWriter(this.ctx);
		for (const child of node.children ?? []) sub.node(child);
		return {
			text: finishInline(sub.out).replaceAll("\n", " "),
			lead: isSpace(sub.out[0]) ? " " : "",
			trail: isSpace(sub.out[sub.out.length - 1]) ? " " : "",
		};
	}

	private wrap(node: DomNode, mark: string) {
		const { text, lead, trail } = this.inner(node);
		this.append(text ? `${lead}${mark}${text}${mark}${trail}` : lead || trail);
	}

	private code(node: DomNode) {
		const text = cleanText(rawText(node, this.ctx), Number.POSITIVE_INFINITY);
		if (!text) return;
		const fence = "`".repeat(longestTicks(text) + 1);
		const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
		this.append(`${fence}${pad}${text}${pad}${fence}`);
	}

	private link(node: DomNode) {
		const url = resolveHref(attr(node, "href"), this.ctx.base);
		if (!url) {
			for (const child of node.children ?? []) this.node(child);
			return;
		}
		const { text, lead, trail } = this.inner(node);
		if (!text) {
			this.append(lead || trail);
			return;
		}
		// A text "!" right before "[" would turn the link into an image.
		if (
			!lead &&
			this.out.endsWith("!") &&
			!this.out.endsWith(`${BACKSLASH}!`)
		) {
			this.out = `${this.out.slice(0, -1)}${BACKSLASH}!`;
		}
		this.append(`${lead}[${text}](${destination(url)})${trail}`);
	}

	private image(node: DomNode) {
		const alt = cleanText(attr(node, "alt"));
		const url = resolveHref(attr(node, "src"), this.ctx.base);
		if (!alt || !url) return;
		this.append(`![${escapeMarkdown(alt)}](${destination(url)})`);
	}
}

function elementChildren(node: DomNode): DomNode[] {
	return (node.children ?? []).filter(isElement);
}

/** True when a subtree holds an element that is not phrasing content. */
function hasBlock(node: DomNode, ctx: Ctx): boolean {
	return elementChildren(node).some(
		(child) =>
			!isSkipped(child, ctx) &&
			(!INLINE.has(tagName(child)) || hasBlock(child, ctx)),
	);
}

function inlineOf(node: DomNode, ctx: Ctx): string {
	const writer = new InlineWriter(ctx);
	for (const child of node.children ?? []) writer.node(child);
	return finishInline(writer.out);
}

/** Prefixes the first line with `first` and every other non-empty line with `rest`. */
function indent(text: string, first: string, rest: string): string {
	return text
		.split("\n")
		.map((line, index) => {
			if (index === 0) return first + line;
			return line ? rest + line : line;
		})
		.join("\n");
}

function renderList(node: DomNode, ordered: boolean, ctx: Ctx): string {
	const start = Number.parseInt(attr(node, "start") ?? "", 10);
	let number = Number.isFinite(start) ? start : 1;
	const items: string[] = [];
	for (const item of elementChildren(node)) {
		if (isSkipped(item, ctx)) continue;
		const body = renderBlocks(item.children ?? [], ctx).join("\n");
		if (!body) continue;
		const marker = ordered ? `${number}. ` : "- ";
		number++;
		items.push(indent(body, marker, " ".repeat(marker.length)));
	}
	return items.join("\n");
}

const LANGUAGE = /^(?:language|lang)-([a-z0-9+#.-]{1,20})$/i;

function renderPre(node: DomNode, ctx: Ctx): string {
	let text = stripControl(rawText(node, ctx)).replace(/\r\n?/g, "\n");
	if (text.startsWith("\n")) text = text.slice(1);
	text = text.trimEnd();
	if (!text.trim()) return "";
	const code = elementChildren(node).find((child) => tagName(child) === "code");
	const classes = [attr(node, "class"), code && attr(code, "class")]
		.join(" ")
		.split(WHITESPACE);
	const lang =
		classes.map((name) => LANGUAGE.exec(name)?.[1]).find(Boolean) ?? "";
	const fence = "`".repeat(Math.max(3, longestTicks(text) + 1));
	return `${fence}${lang}\n${text}\n${fence}`;
}

function tableRows(table: DomNode): DomNode[] {
	const rows: DomNode[] = [];
	const visit = (node: DomNode) => {
		for (const child of elementChildren(node)) {
			const name = tagName(child);
			if (name === "tr") rows.push(child);
			else if (name === "thead" || name === "tbody" || name === "tfoot") {
				visit(child);
			}
		}
	};
	visit(table);
	return rows;
}

function renderTable(node: DomNode, ctx: Ctx): string {
	const rows = tableRows(node)
		.map((row) =>
			elementChildren(row)
				.filter((cell) => tagName(cell) === "td" || tagName(cell) === "th")
				.map((cell) =>
					inlineOf(cell, ctx)
						.replaceAll("\n", " ")
						.replaceAll("|", `${BACKSLASH}|`),
				),
		)
		.filter((cells) => cells.some(Boolean));
	const [head, ...body] = rows;
	if (!head) return "";
	if (rows.every((cells) => cells.length === head.length)) {
		const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
		return [line(head), line(head.map(() => "---")), ...body.map(line)].join(
			"\n",
		);
	}
	return rows.map((cells) => cells.filter(Boolean).join(" | ")).join("\n");
}

function renderQuote(node: DomNode, ctx: Ctx): string {
	return renderBlocks(node.children ?? [], ctx)
		.join("\n\n")
		.split("\n")
		.map((line) => (line ? `> ${line}` : ">"))
		.join("\n");
}

/** Renders nodes into markdown blocks (paragraphs, headings, lists...). */
function renderBlocks(nodes: DomNode[], ctx: Ctx): string[] {
	const blocks: string[] = [];
	let writer = new InlineWriter(ctx);
	const flush = () => {
		const text = finishInline(writer.out);
		if (text) blocks.push(text);
		writer = new InlineWriter(ctx);
	};
	const push = (block: string) => {
		flush();
		if (block) blocks.push(block);
	};
	for (const node of nodes) {
		if (node.type === "text") {
			writer.node(node);
			continue;
		}
		if (!isElement(node) || isSkipped(node, ctx)) continue;
		const name = tagName(node);
		const heading = HEADING.exec(name);
		if (heading) {
			const text = inlineOf(node, ctx).replaceAll("\n", " ");
			push(text ? `${"#".repeat(Number(heading[1]))} ${text}` : "");
		} else if (name === "ul" || name === "ol") {
			push(renderList(node, name === "ol", ctx));
		} else if (name === "pre") {
			push(renderPre(node, ctx));
		} else if (name === "blockquote") {
			push(renderQuote(node, ctx));
		} else if (name === "hr") {
			push("---");
		} else if (name === "table") {
			push(renderTable(node, ctx));
		} else if (INLINE.has(name) && (name === "a" || !hasBlock(node, ctx))) {
			writer.node(node);
		} else {
			flush();
			blocks.push(...renderBlocks(node.children ?? [], ctx));
		}
	}
	flush();
	return blocks;
}

function bytes(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

/** Leading list markers and quote marks of a line, and the rest of it. */
const LINE_PREFIX = /^((?:[ >]|[-*+] |[0-9]+[.)] )*)(.*)$/;
const FENCE_LINE = /^(`{3,})/;

interface OpenFence {
	ticks: number;
	/** Line that closes the fence, with its leading newline. */
	closing: string;
}

/** The longest prefix of `value` (on code points) that fits in `max` bytes. */
function cutPoints(value: string, max: number): string {
	let out = "";
	let size = 0;
	for (const char of value) {
		size += bytes(char);
		if (size > max) break;
		out += char;
	}
	return out;
}

/**
 * Cuts one oversized block to `budget` bytes: whole lines while they fit (the
 * first line on code points when even it does not), closing a code fence the
 * cut leaves open.
 */
function cutBlock(block: string, budget: number): string {
	const lines: string[] = [];
	let size = 0;
	let open: OpenFence | null = null;
	for (const line of block.split("\n")) {
		const [, prefix = "", rest = ""] = LINE_PREFIX.exec(line) ?? [];
		const ticks = FENCE_LINE.exec(rest)?.[1]?.length ?? 0;
		let next: OpenFence | null = open;
		if (open && ticks >= open.ticks && rest.trim() === "`".repeat(ticks)) {
			next = null;
		} else if (!open && ticks > 0) {
			const indentOnly = prefix.replace(/[-*+0-9.)]/g, " ");
			next = { ticks, closing: `\n${indentOnly}${"`".repeat(ticks)}` };
		}
		const extra = bytes(line) + (lines.length > 0 ? 1 : 0);
		if (size + extra + bytes(next?.closing ?? "") > budget) {
			if (lines.length === 0) {
				lines.push(cutPoints(line, budget));
				open = null;
			}
			break;
		}
		lines.push(line);
		size += extra;
		open = next;
	}
	const kept = lines.join("\n");
	return kept && open ? kept + open.closing : kept;
}

/** Joins blocks with blank lines; above the limit cuts at a block boundary and adds the marker. */
function joinWithLimit(blocks: string[]): string {
	const full = blocks.join("\n\n");
	if (bytes(full) <= PAGE_MARKDOWN_MAX) return full;
	const budget = PAGE_MARKDOWN_MAX - bytes(`\n\n${CUT_MARKER}`);
	const kept: string[] = [];
	let size = 0;
	for (const block of blocks) {
		const add = bytes(block) + (kept.length > 0 ? 2 : 0);
		if (size + add > budget) break;
		kept.push(block);
		size += add;
	}
	if (kept.length === 0) {
		const cut = cutBlock(blocks[0] ?? "", budget);
		if (cut) kept.push(cut);
	}
	return kept.length > 0 ? `${kept.join("\n\n")}\n\n${CUT_MARKER}` : CUT_MARKER;
}

/** Main content of a page as markdown; "" when it has none. */
export function pageMarkdown($: CheerioAPI, url: URL): string {
	let main: ReturnType<CheerioAPI> | undefined;
	for (const selector of ["main", "[role=main]", "article"]) {
		const found = $(selector).first();
		if (found.length > 0) {
			main = found;
			break;
		}
	}
	const root = (main ?? $("body").first())[0] as unknown as DomNode | undefined;
	if (!root) return "";
	const ctx: Ctx = { chrome: !main, base: url, tooDeep: deepElements(root) };
	return joinWithLimit(renderBlocks(root.children ?? [], ctx));
}

const FENCE = /^ *(`{3,})/;
const ATX = /^(#{1,6})(?= |$)/;

/** Applies `fn` to each line outside fenced code; fence lines and code stay as they are. */
function mapOutsideFences(
	markdown: string,
	fn: (line: string) => string,
): string {
	let fence = 0;
	return markdown
		.split("\n")
		.map((line) => {
			const ticks = FENCE.exec(line)?.[1]?.length ?? 0;
			if (fence > 0) {
				if (ticks >= fence && line.trim() === "`".repeat(ticks)) fence = 0;
				return line;
			}
			if (ticks > 0) {
				fence = ticks;
				return line;
			}
			return fn(line);
		})
		.join("\n");
}

/** Shifts ATX headings down by `levels` (capped at ######); fenced code is left alone. */
export function shiftHeadings(markdown: string, levels: number): string {
	if (levels <= 0) return markdown;
	return mapOutsideFences(markdown, (line) =>
		line.replace(ATX, (hashes) =>
			"#".repeat(Math.min(6, hashes.length + levels)),
		),
	);
}

/** Whether the markdown has an ATX heading of `level` outside fenced code. */
export function hasHeading(markdown: string, level: number): boolean {
	let found = false;
	mapOutsideFences(markdown, (line) => {
		if (ATX.exec(line)?.[1]?.length === level) found = true;
		return line;
	});
	return found;
}
