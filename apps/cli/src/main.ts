import { parseArgs } from "node:util";
import {
	type BrowserRenderer,
	CRAWL_LIMIT_DEFAULT,
	CRAWL_LIMIT_MAX,
	createBrowserRenderer,
	defaultUserAgent,
	disabledRenderer,
	renderHtml,
	renderTerminal,
	runAudit,
} from "@agentcheck/core";
import type { Dispatcher } from "undici";
import pkg from "../package.json" with { type: "json" };
import { runFix } from "./fix.ts";
import { failureMessage, normalizeTarget } from "./target.ts";

/** The running tool's version is the CLI package version. */
export const CLI_VERSION: string = pkg.version;

export interface CliDeps {
	env: Record<string, string | undefined>;
	stdout: (s: string) => void;
	stderr: (s: string) => void;
	isTTY: boolean;
	dispatcher?: Dispatcher;
	/** Base for relative output paths (fix subcommand); defaults to process.cwd(). */
	cwd?: string;
	/** Browser renderer; defaults to the real one. Tests inject fakes. */
	renderer?: BrowserRenderer;
}

const USAGE =
	"Usage: agentcheck <url> [--threshold=N] [--format=FORMAT] [--user-agent=STRING] [--no-browser] [--crawl [--limit=N]]";

const FIX_LINE =
	"       agentcheck fix <url> [--out=DIR] [--only=KINDS] [--force]  (write fix files; see: agentcheck fix --help)";

const HELP = `${USAGE}
${FIX_LINE}

Audit how ready a website is for AI agents, search LLMs and autonomous browsers.

Options:
  --threshold=N         Exit with code 1 when the overall score is below N (0-100)
                        (with --crawl: the site score, the average of the pages)
  --format=FORMAT       Output format: terminal (default), json or html
  --user-agent=STRING   User-Agent header to send (env: AGENTCHECK_USER_AGENT)
  --no-browser          Skip browser checks (Agentic Actionability)
  --crawl               Also audit other pages of the site (from its sitemap,
                        else its menu links); the browser runs on the first only
  --limit=N             Pages to audit with --crawl, the URL included
                        (1-${CRAWL_LIMIT_MAX}, default ${CRAWL_LIMIT_DEFAULT})
  -h, --help            Show this help and exit
  -v, --version         Show the version and exit
`;

const OPTIONS = {
	help: { type: "boolean", short: "h" },
	version: { type: "boolean", short: "v" },
	threshold: { type: "string" },
	"user-agent": { type: "string" },
	"no-browser": { type: "boolean" },
	crawl: { type: "boolean" },
	limit: { type: "string" },
	format: { type: "string" },
	// Declared so they produce a specific message instead of "unknown option".
	output: { type: "string" },
	"report-dir": { type: "string" },
} as const;

const NOT_IMPLEMENTED = ["output", "report-dir"] as const;

type ParsedValues = ReturnType<
	typeof parseArgs<{ options: typeof OPTIONS }>
>["values"];

function parseThreshold(raw: string): number | null {
	if (!/^\d+$/.test(raw)) return null;
	const n = Number(raw);
	return n <= 100 ? n : null;
}

function parseLimit(raw: string): number | null {
	if (!/^\d+$/.test(raw)) return null;
	const n = Number(raw);
	return n >= 1 && n <= CRAWL_LIMIT_MAX ? n : null;
}

export async function run(argv: string[], deps: CliDeps): Promise<number> {
	if (argv[0] === "fix") return runFix(argv.slice(1), deps);
	let parsed: { values: ParsedValues; positionals: string[] };
	try {
		parsed = parseArgs({
			args: argv,
			options: OPTIONS,
			strict: true,
			allowPositionals: true,
		});
	} catch (err) {
		deps.stderr(`${(err as Error).message}\n${USAGE}\n`);
		return 2;
	}
	const { values, positionals } = parsed;

	if (values.help) {
		deps.stdout(HELP);
		return 0;
	}
	if (values.version) {
		deps.stdout(`${CLI_VERSION}\n`);
		return 0;
	}

	for (const flag of NOT_IMPLEMENTED) {
		if (values[flag] !== undefined) {
			deps.stderr(`--${flag} is not implemented yet\n`);
			return 2;
		}
	}

	const format = values.format ?? "terminal";
	if (format !== "terminal" && format !== "json" && format !== "html") {
		deps.stderr(
			`--format must be terminal, json or html, got "${format}"
`,
		);
		return 2;
	}

	if (positionals.length !== 1 || !positionals[0]) {
		deps.stderr(`${USAGE}\n`);
		return 2;
	}

	let threshold: number | undefined;
	if (values.threshold !== undefined) {
		const parsedThreshold = parseThreshold(values.threshold);
		if (parsedThreshold === null) {
			deps.stderr(
				`--threshold must be an integer between 0 and 100, got "${values.threshold}"\n`,
			);
			return 2;
		}
		threshold = parsedThreshold;
	}

	let crawl: { limit: number } | undefined;
	if (values.limit !== undefined && !values.crawl) {
		deps.stderr("--limit needs --crawl\n");
		return 2;
	}
	if (values.crawl) {
		const limit =
			values.limit === undefined
				? CRAWL_LIMIT_DEFAULT
				: parseLimit(values.limit);
		if (limit === null) {
			deps.stderr(
				`--limit must be an integer between 1 and ${CRAWL_LIMIT_MAX}, got "${values.limit}"\n`,
			);
			return 2;
		}
		crawl = { limit };
	}

	const customUserAgent =
		values["user-agent"] || deps.env.AGENTCHECK_USER_AGENT || undefined;
	const userAgent = customUserAgent ?? defaultUserAgent(CLI_VERSION);
	const renderer = values["no-browser"]
		? disabledRenderer()
		: (deps.renderer ?? createBrowserRenderer({ toolVersion: CLI_VERSION }));

	let result: Awaited<ReturnType<typeof runAudit>>;
	try {
		result = await runAudit(normalizeTarget(positionals[0]), {
			userAgent,
			toolVersion: CLI_VERSION,
			dispatcher: deps.dispatcher,
			renderer,
			browserUserAgent: customUserAgent,
			...(crawl ? { crawl } : {}),
		});
	} catch (err) {
		deps.stderr(failureMessage(err));
		return 2;
	}

	if (format === "json") {
		deps.stdout(`${JSON.stringify(result, null, 2)}
`);
	} else if (format === "html") {
		deps.stdout(renderHtml(result));
	} else {
		deps.stdout(
			renderTerminal(result, { color: deps.isTTY && !deps.env.NO_COLOR }),
		);
	}

	const score = result.crawl?.score ?? result.score;
	if (threshold !== undefined && score < threshold) {
		deps.stderr(
			`${result.crawl ? "Site score" : "Score"} ${score} is below threshold ${threshold}\n`,
		);
		return 1;
	}
	return 0;
}
