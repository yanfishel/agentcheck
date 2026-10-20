import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { defaultUserAgent, disabledRenderer, runAudit } from "@agentcheck/core";
import {
	agentPrompt,
	FIX_KIND_ORDER,
	type FixKind,
	fixKindsFor,
	generateFixFiles,
	readme,
} from "@agentcheck/core/fixes";
import pkg from "../package.json" with { type: "json" };
import type { CliDeps } from "./main.js";
import { failureMessage, normalizeTarget } from "./target.ts";

const DEFAULT_OUT = "agentcheck-fix";

export const FIX_USAGE =
	"Usage: agentcheck fix <url> [--out=DIR] [--only=KINDS] [--force] [--user-agent=STRING]";

export const FIX_HELP = `${FIX_USAGE}

Audit a site and write the files that fix what the audit found: robots.txt,
llms.txt, llms-full.txt, a markdown twin of the page and head tags, plus
README.md and AGENT-PROMPT.md (a task for a coding agent).

Options:
  --out=DIR             Directory to write into (default: ./${DEFAULT_OUT})
  --only=KINDS          Comma-separated kinds: ${FIX_KIND_ORDER.join(", ")}.
                        Skips the audit and builds exactly these files
  --force               Overwrite files that already exist in --out
  --user-agent=STRING   User-Agent header to send (env: AGENTCHECK_USER_AGENT)
  -h, --help            Show this help and exit
`;

const OPTIONS = {
	help: { type: "boolean", short: "h" },
	out: { type: "string" },
	only: { type: "string" },
	force: { type: "boolean" },
	"user-agent": { type: "string" },
} as const;

const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/;

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

function fail(deps: CliDeps, err: unknown): number {
	deps.stderr(failureMessage(err));
	return 2;
}

/** `agentcheck fix <url>`: argv is what follows the word "fix". */
export async function runFix(argv: string[], deps: CliDeps): Promise<number> {
	let parsed: {
		values: ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>["values"];
		positionals: string[];
	};
	try {
		parsed = parseArgs({
			args: argv,
			options: OPTIONS,
			strict: true,
			allowPositionals: true,
		});
	} catch (err) {
		deps.stderr(`${(err as Error).message}\n${FIX_USAGE}\n`);
		return 2;
	}
	const { values, positionals } = parsed;
	if (values.help) {
		deps.stdout(FIX_HELP);
		return 0;
	}
	if (positionals.length !== 1 || !positionals[0]) {
		deps.stderr(`${FIX_USAGE}\n`);
		return 2;
	}

	let only: FixKind[] | undefined;
	if (values.only !== undefined) {
		const names = values.only
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		const unknown = names.find((n) => !FIX_KIND_ORDER.includes(n as FixKind));
		if (unknown !== undefined || names.length === 0) {
			deps.stderr(
				`Unknown kind "${unknown ?? values.only}" in --only; use ${FIX_KIND_ORDER.join(", ")}\n`,
			);
			return 2;
		}
		only = FIX_KIND_ORDER.filter((k) => names.includes(k));
	}

	if (values.out !== undefined && values.out.trim() === "") {
		deps.stderr(`--out needs a directory\n${FIX_USAGE}\n`);
		return 2;
	}
	const outDir = resolve(
		deps.cwd ?? process.cwd(),
		values.out ?? `./${DEFAULT_OUT}`,
	);
	const customUserAgent =
		values["user-agent"] || deps.env.AGENTCHECK_USER_AGENT || undefined;
	const userAgent = customUserAgent ?? defaultUserAgent(pkg.version);
	const toolVersion = pkg.version;
	const url = normalizeTarget(positionals[0]);

	let kinds: FixKind[];
	let auditResult: Awaited<ReturnType<typeof runAudit>> | undefined;
	let fixUrl = url;
	if (only) {
		kinds = only;
	} else {
		deps.stderr(`Auditing ${url} ...\n`);
		try {
			auditResult = await runAudit(url, {
				userAgent,
				toolVersion,
				dispatcher: deps.dispatcher,
				renderer: disabledRenderer(),
				browserUserAgent: customUserAgent,
			});
		} catch (err) {
			return fail(deps, err);
		}
		fixUrl = auditResult.finalUrl;
		kinds = fixKindsFor(auditResult);
		if (kinds.length === 0) {
			deps.stdout(
				`Nothing to fix: the audit found nothing the fix files can repair (score ${auditResult.score}/100).\n`,
			);
			return 0;
		}
	}

	deps.stderr("Reading pages ...\n");
	let files: Awaited<ReturnType<typeof generateFixFiles>>;
	try {
		files = await generateFixFiles(
			{ url: fixUrl, kinds },
			{ userAgent, toolVersion, dispatcher: deps.dispatcher },
		);
	} catch (err) {
		return fail(deps, err);
	}

	const emptyResult = { categories: [] };
	const result = auditResult ?? emptyResult;
	const outputs = [
		...files.files.map((f) => ({ name: f.name, content: f.content })),
		{ name: "README.md", content: readme(files, { url: fixUrl, result }) },
		{
			name: "AGENT-PROMPT.md",
			content: agentPrompt(files, { url: fixUrl, result }),
		},
	];
	if (files.files.length === 0) {
		deps.stdout(
			[
				"Nothing written.",
				"",
				"Skipped:",
				...files.skipped.map((s) => `  ${s.kind}: ${s.reason}`),
				"",
			].join("\n"),
		);
		// A kind whose input could not be read is a failure, not "already fine".
		return files.skipped.some((s) => s.error) ? 2 : 0;
	}

	const unsafe = files.files.find(
		(f) => !SAFE_NAME.test(f.name) || basename(f.name) !== f.name,
	);
	if (unsafe) {
		deps.stderr(
			`Refusing to write a file with an unsafe name: ${JSON.stringify(unsafe.name)}\n`,
		);
		return 2;
	}

	const written: string[] = [];
	try {
		if (!values.force) {
			const taken: string[] = [];
			for (const o of outputs) {
				if (await exists(resolve(outDir, o.name))) taken.push(o.name);
			}
			if (taken.length > 0) {
				deps.stderr(
					`Refusing to overwrite existing files in ${outDir}: ${taken.join(", ")}\nUse --force to overwrite them, or choose another directory with --out.\n`,
				);
				return 2;
			}
		}
		await mkdir(outDir, { recursive: true });
		for (const o of outputs) {
			await writeFile(resolve(outDir, o.name), o.content, {
				encoding: "utf8",
				flag: values.force ? "w" : "wx",
			});
			written.push(o.name);
		}
	} catch (err) {
		const code = fail(deps, err);
		if (written.length > 0) {
			deps.stderr(
				`Already written to ${outDir} before the error: ${written.join(", ")}\n`,
			);
		}
		return code;
	}

	const lines = ["Wrote:"];
	for (const f of files.files) lines.push(`  ${f.name}  ${f.target}`);
	lines.push("  README.md");
	lines.push("  AGENT-PROMPT.md");
	if (files.skipped.length > 0) {
		lines.push("", "Skipped:");
		for (const s of files.skipped) lines.push(`  ${s.kind}: ${s.reason}`);
	}
	const todos = files.files.flatMap((f) => f.todos.map((t) => t.text));
	if (todos.length > 0) {
		lines.push("", "To fill in by hand:");
		for (const t of todos) lines.push(`  - ${t}`);
	}
	lines.push("", `Files are in ${outDir}`, "");
	deps.stdout(lines.join("\n"));
	return 0;
}
