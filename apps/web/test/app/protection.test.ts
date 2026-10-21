import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL("../../src", import.meta.url));
const appDir = join(srcDir, "app");

/** Pages that are public on purpose (paths relative to src/app, POSIX style). */
const PUBLIC = new Set([
	"page.tsx",
	"sign-in/[[...sign-in]]/page.tsx",
	"sign-up/[[...sign-up]]/page.tsx",
	// Clerk deliveries carry no session; handleClerkWebhook verifies the signature.
	"api/webhooks/clerk/route.ts",
	// Static legal documents: no data, nothing to authorise.
	"privacy/page.tsx",
	"terms/page.tsx",
	// Anonymous quick audits are allowed by design; it authorises inside handleStartAudit.
	"api/audits/route.ts",
	// Authorises inside handleShare/handleUnshare (access + owner check).
	"api/audits/[id]/share/route.ts",
	// Public by design: the share token is the capability; 404 without a matching done audit.
	"r/[shareToken]/page.tsx",
	// Public by design: the share token is the capability; 404 otherwise.
	"api/shared/[token]/badge.svg/route.ts",
	// Public by design: the share token is the capability; 404 otherwise.
	"api/shared/[token]/og.png/route.ts",
	// Public by design: the share token is the capability; 404 otherwise.
	"api/shared/[token]/export/route.ts",
	// Public by design: the share token is the capability; 404 otherwise.
	"api/shared/[token]/screenshot/route.ts",
	// Public by design: the share token is the capability; 404 otherwise.
	"api/shared/[token]/favicon/route.ts",
]);

const GUARDS = [
	"await auth.protect(",
	"requireAdmin(",
	"requireActiveUser(",
	"requireAuditAccess(",
];

const ROUTE_FILES = new Set(["page.tsx", "page.ts", "route.ts", "route.tsx"]);
const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|mjs)$/;

function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm, "");
}

/** True when the source, ignoring comments, awaits auth.protect() or calls a guard. */
export function isGuarded(source: string): boolean {
	const code = stripComments(source);
	return GUARDS.some((guard) => code.includes(guard));
}

/** True when any line is a "use server" directive (file-level or inside a function body). */
export function isServerActionFile(source: string): boolean {
	return /^\s*(?:"use server"|'use server')\s*;?\s*$/m.test(
		stripComments(source),
	);
}

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		if (entry.name === "node_modules" || entry.name === ".next") return [];
		const path = join(dir, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

function routeFiles(dir: string): string[] {
	return walk(dir).filter((path) => ROUTE_FILES.has(basename(path)));
}

function serverActionFiles(): string[] {
	return walk(srcDir).filter(
		(path) =>
			SOURCE_FILE.test(path) && isServerActionFile(readFileSync(path, "utf8")),
	);
}

describe("route protection", () => {
	it("finds the route files", () => {
		expect(routeFiles(appDir).length).toBeGreaterThan(3);
	});

	it("guards every page, route handler and Server Action that is not explicitly public", () => {
		const unprotected = [...routeFiles(appDir), ...serverActionFiles()]
			.map((file) => relative(appDir, file).split(sep).join("/"))
			.filter((rel) => !PUBLIC.has(rel))
			.filter((rel) => !isGuarded(readFileSync(join(appDir, rel), "utf8")));
		expect(
			unprotected,
			`Unprotected route file(s): ${unprotected.join(", ")}. Add "await auth.protect()" (and requireActiveUser()/requireAdmin()/requireAuditAccess()) at the top of the page, handler or Server Action, or add the file to the PUBLIC allowlist in protection.test.ts if it is meant to be public.`,
		).toEqual([]);
	});
});

describe("dynamic page rendering", () => {
	it.each(["r/[shareToken]/page.tsx", "audits/[id]/page.tsx"])(
		"renders %s dynamically",
		(file) => {
			const source = readFileSync(join(appDir, file), "utf8");
			expect(stripComments(source)).toMatch(
				/export const dynamic = "force-dynamic"/,
			);
		},
	);
});

describe("isGuarded", () => {
	it.each([
		"export default async function P() { await auth.protect(); }",
		"const x = 1; /* note */ await requireAuditAccess(audit, viewer);",
	])("accepts %s", (src) => expect(isGuarded(src)).toBe(true));
	it.each([
		"// await auth.protect()\nexport async function GET() {}",
		"/* await auth.protect() */ export async function GET() {}",
		"auth.protect(); // not awaited",
		"export async function GET() { return Response.json({}) }",
	])("rejects %s", (src) => expect(isGuarded(src)).toBe(false));
});

describe("isServerActionFile", () => {
	it.each([
		'"use server";\nexport async function a() {}',
		'export async function a() {\n\t"use server";\n\treturn 1;\n}',
	])("accepts %s", (src) => expect(isServerActionFile(src)).toBe(true));
	it.each([
		'// "use server"\nexport async function a() {}',
		'const s = "use server";',
	])("rejects %s", (src) => expect(isServerActionFile(src)).toBe(false));
});
