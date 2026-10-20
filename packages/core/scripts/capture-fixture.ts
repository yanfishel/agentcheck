// Captures a site's key responses into test/fixtures/sites/<name>/ for offline tests.
// Usage: pnpm capture <name> <url>
// Standalone on purpose: no imports from src, so it never changes with the code under test.
import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface RouteEntry {
	status: number;
	contentType?: string;
	file?: string;
}

const FIXED_PATHS = ["/robots.txt", "/llms.txt", "/llms-full.txt", "/index.md"];
const TIMEOUT_MS = 15_000;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /\+?\d[\d\s-]{8,}\d/g;
/** International numbers only ("+" first), so digit runs in markup (ids, SVG paths) stay intact. */
const INTERNATIONAL_PHONE = /\+\d[\d\s-]{8,}\d/g;
const ALLOWED_EMAIL = /@example\.(?:com|org|net)$/i;
const ALLOWED_PHONE = /^[+0\s-]+$/;
const EMAIL_PLACEHOLDER = "owner@example.com";
const PHONE_PLACEHOLDER = "+000-00-0000000";

/** Replaces email addresses and international phone numbers outside the allowlist with placeholders, so personal data never reaches the repo. */
export function sanitize(text: string): string {
	return text
		.replace(EMAIL, (m) => (ALLOWED_EMAIL.test(m) ? m : EMAIL_PLACEHOLDER))
		.replace(INTERNATIONAL_PHONE, (m) =>
			ALLOWED_PHONE.test(m) ? m : PHONE_PLACEHOLDER,
		);
}

/** Email addresses and phone-like numbers that are not on the allowlist. */
export function findPrivateData(text: string): string[] {
	const emails = (text.match(EMAIL) ?? []).filter(
		(m) => !ALLOWED_EMAIL.test(m),
	);
	const phones = (text.match(PHONE) ?? []).filter(
		(m) => !ALLOWED_PHONE.test(m),
	);
	return [...new Set([...emails, ...phones])];
}

function isTextBody(entry: RouteEntry): boolean {
	const type = entry.contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
	return (
		type.startsWith("text/") ||
		type.includes("json") ||
		type.includes("xml") ||
		type === ""
	);
}

export function fileNameFor(path: string): string {
	if (path === "/") return "index.html";
	return path.replace(/^\//, "").replaceAll("/", "__");
}

const ATTRIBUTE = /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/** Same-origin hrefs of every `<link rel="alternate" type="text/markdown">`, as path + query. */
export function findMarkdownAlternates(html: string, base: string): string[] {
	const baseUrl = new URL(base);
	const paths: string[] = [];
	for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
		const attrs: Record<string, string> = {};
		for (const m of tag.matchAll(ATTRIBUTE)) {
			attrs[(m[1] ?? "").toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
		}
		if (attrs.rel?.toLowerCase() !== "alternate") continue;
		if (attrs.type?.toLowerCase() !== "text/markdown") continue;
		if (!attrs.href) continue;
		const url = new URL(attrs.href, baseUrl);
		if (url.origin === baseUrl.origin) paths.push(url.pathname + url.search);
	}
	return paths;
}

async function main(): Promise<void> {
	const [name, url] = process.argv.slice(2);
	if (!name || !url) {
		console.error("Usage: pnpm capture <name> <url>");
		process.exit(2);
	}
	const root = join(dirname(fileURLToPath(import.meta.url)), "..");
	const version = (
		JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
			version: string;
		}
	).version;
	const userAgent = `AgentCheck-fixture-capture/${version}`;

	let origin = new URL(url).origin;
	const routes: Record<string, RouteEntry> = {};
	const bodies = new Map<string, Uint8Array>();

	async function capture(path: string): Promise<void> {
		const res = await fetch(new URL(path, origin), {
			redirect: "follow",
			headers: { "user-agent": userAgent },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		const bytes = new Uint8Array(await res.arrayBuffer());
		const contentType = res.headers.get("content-type") ?? undefined;
		const entry: RouteEntry = {
			status: res.status,
			...(contentType ? { contentType } : {}),
		};
		if (path === "/") origin = new URL(res.url).origin;
		if (res.ok) {
			entry.file = fileNameFor(path);
			bodies.set(entry.file, bytes);
		}
		routes[path] = entry;
		console.log(
			`${path} -> ${res.status} ${contentType ?? ""} ${bytes.length}B`,
		);
	}

	try {
		await capture("/");
		const home = bodies.get("index.html");
		if (!home) throw new Error(`"/" returned status ${routes["/"]?.status}`);
		const extra = findMarkdownAlternates(
			new TextDecoder().decode(home),
			new URL("/", origin).href,
		);
		for (const path of [...FIXED_PATHS, ...extra]) {
			if (!(path in routes)) await capture(path);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Capture failed, fixture left untouched: ${message}`);
		process.exit(1);
	}

	// Privacy guard: sanitize text bodies, then warn about anything that still looks personal.
	const warnings: string[] = [];
	for (const entry of Object.values(routes)) {
		if (!entry.file || !isTextBody(entry)) continue;
		const bytes = bodies.get(entry.file);
		if (!bytes) continue;
		const text = sanitize(new TextDecoder().decode(bytes));
		bodies.set(entry.file, new TextEncoder().encode(text));
		for (const match of findPrivateData(text)) {
			warnings.push(`  ${entry.file}: ${match}`);
		}
	}
	if (warnings.length > 0) {
		console.warn(
			`WARNING: possible personal data left in the fixture, review before committing:\n${warnings.join("\n")}`,
		);
	}

	const sorted = Object.fromEntries(
		Object.entries(routes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
	);
	const sitesDir = join(root, "test", "fixtures", "sites");
	const dir = join(sitesDir, name);
	const tmp = join(sitesDir, `.${name}.tmp`);
	rmSync(tmp, { recursive: true, force: true });
	mkdirSync(tmp, { recursive: true });
	for (const [file, bytes] of bodies) writeFileSync(join(tmp, file), bytes);
	writeFileSync(
		join(tmp, "routes.json"),
		`${JSON.stringify({ origin, routes: sorted }, null, "\t")}\n`,
	);
	rmSync(dir, { recursive: true, force: true });
	renameSync(tmp, dir);
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main();
}
