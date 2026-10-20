import {
	type BrowserRenderer,
	DISABLED_REASON,
	defaultUserAgent,
	disabledRenderer,
	UNAVAILABLE_REASON,
} from "@agentcheck/core";
import {
	fakeRenderer,
	mockRoutes,
	renderedPage,
} from "@agentcheck/core/test-helpers";
import type { MockAgent } from "undici";
import { describe, expect, it } from "vitest";
import cliPkg from "../package.json" with { type: "json" };
import { run } from "../src/main.js";

const ORIGIN = "https://example.com";
const PAGE = { status: 200, contentType: "text/html", body: "<html></html>" };
const ROBOTS_OPEN = {
	status: 200,
	contentType: "text/plain",
	body: "User-agent: *\nAllow: /",
};
const ROBOTS_BLOCKING = {
	status: 200,
	contentType: "text/plain",
	body: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /",
};

const LLMS_TXT = {
	status: 200,
	contentType: "text/plain",
	body: "# Example\n\n> Summary.\n\n## Docs\n- [Home](https://example.com/)",
};

function openSite(
	extra: { onRequest?: (h: Record<string, string>) => void } = {},
): MockAgent {
	return mockRoutes(ORIGIN, {
		"/": { ...PAGE, ...extra },
		"/robots.txt": ROBOTS_OPEN,
		"/llms.txt": LLMS_TXT,
		"/llms-full.txt": { ...LLMS_TXT, body: "# Example\n\nFull text." },
	});
}

async function exec(
	argv: string[],
	opts: {
		env?: Record<string, string | undefined>;
		isTTY?: boolean;
		dispatcher?: MockAgent;
		renderer?: BrowserRenderer;
	} = {},
) {
	let stdout = "";
	let stderr = "";
	const code = await run(argv, {
		env: opts.env ?? {},
		isTTY: opts.isTTY ?? false,
		stdout: (s) => {
			stdout += s;
		},
		stderr: (s) => {
			stderr += s;
		},
		dispatcher: opts.dispatcher ?? openSite(),
		renderer: opts.renderer ?? disabledRenderer(),
	});
	return { code, stdout, stderr };
}

describe("run", () => {
	it.each([["--help"], ["-h"]])(
		"prints usage for %s without a request",
		async (flag) => {
			let requests = 0;
			const dispatcher = openSite({
				onRequest: () => {
					requests++;
				},
			});
			const { code, stdout, stderr } = await exec([flag], { dispatcher });
			expect(code).toBe(0);
			expect(stdout).toContain("Usage: agentcheck <url>");
			expect(stdout).toContain("--threshold");
			expect(stdout).toContain("--version");
			expect(stderr).toBe("");
			expect(requests).toBe(0);
		},
	);

	it.each([["--version"], ["-v"]])(
		"prints the version for %s without a request",
		async (flag) => {
			let requests = 0;
			const dispatcher = openSite({
				onRequest: () => {
					requests++;
				},
			});
			const { code, stdout } = await exec([flag, "example.com"], {
				dispatcher,
			});
			expect(code).toBe(0);
			expect(stdout).toBe(`${cliPkg.version}\n`);
			expect(requests).toBe(0);
		},
	);

	it("shows the CLI version in the report header", async () => {
		const { stdout } = await exec(["example.com"]);
		expect(stdout).toContain(` AgentCheck v${cliPkg.version} `);
	});

	it("adds the https scheme to a bare host", async () => {
		const { code, stdout } = await exec(["example.com"]);
		expect(code).toBe(0);
		expect(stdout).toContain("Target: https://example.com/");
	});

	it("keeps an explicit scheme", async () => {
		const { stdout } = await exec(["http://example.com"], {
			dispatcher: mockRoutes("http://example.com", {
				"/": PAGE,
				"/robots.txt": ROBOTS_OPEN,
			}),
		});
		expect(stdout).toContain("Target: http://example.com/");
	});

	it("exits 1 when the score is below the threshold", async () => {
		const blocked = () =>
			mockRoutes(ORIGIN, { "/": PAGE, "/robots.txt": ROBOTS_BLOCKING });
		const low = await exec(["example.com", "--threshold=100"], {
			dispatcher: blocked(),
		});
		expect(low.code).toBe(1);
		expect(low.stderr).toMatch(/Score \d+ is below threshold 100/);
		const ok = await exec(["example.com", "--threshold=0"], {
			dispatcher: blocked(),
		});
		expect(ok.code).toBe(0);
		expect(ok.stderr).toBe("");
	});

	it("exits 0 with a passing threshold", async () => {
		const { code } = await exec(["https://example.com", "--threshold=50"]);
		expect(code).toBe(0);
	});

	it.each([
		["--threshold"],
		["--threshold=abc"],
		["--threshold=101"],
		["--threshold=-1"],
		["--threshold=5.5"],
		["--threshold="],
	])("rejects invalid threshold %s", async (flag) => {
		const { code, stderr, stdout } = await exec(["example.com", flag]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("threshold");
		expect(stdout).toBe("");
	});

	it("prints usage when no URL is given", async () => {
		const { code, stderr } = await exec([]);
		expect(code).toBe(2);
		expect(stderr).toContain(
			"Usage: agentcheck <url> [--threshold=N] [--format=FORMAT] [--user-agent=STRING] [--no-browser]",
		);
	});

	it("rejects extra positionals and unknown options", async () => {
		expect((await exec(["a.com", "b.com"])).code).toBe(2);
		const unknown = await exec(["a.com", "--bogus"]);
		expect(unknown.code).toBe(2);
		expect(unknown.stderr).toContain("--bogus");
	});

	it.each([["--crawl"], ["--limit=5"], ["--output=html"], ["--report-dir=x"]])(
		"reports %s as not implemented",
		async (flag) => {
			const { code, stderr } = await exec(["example.com", flag]);
			expect(code).toBe(2);
			expect(stderr).toContain("not implemented yet");
		},
	);

	it("--format=json prints only the result JSON", async () => {
		const { code, stdout, stderr } = await exec(
			[ORIGIN, "--format=json", "--no-browser"],
			{ dispatcher: openSite() },
		);
		expect(code).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.tool.name).toBe("agentcheck");
		expect(stderr).toBe("");
	});

	it("--format=json with a failing threshold keeps stdout clean and exits 1", async () => {
		const { code, stdout, stderr } = await exec(
			[ORIGIN, "--format=json", "--no-browser", "--threshold=100"],
			{ dispatcher: openSite() },
		);
		expect(code).toBe(1);
		expect(() => JSON.parse(stdout)).not.toThrow();
		expect(stderr).toContain("threshold");
	});

	it("--format=html prints a self-contained document", async () => {
		const { code, stdout } = await exec(
			[ORIGIN, "--format=html", "--no-browser"],
			{ dispatcher: openSite() },
		);
		expect(code).toBe(0);
		expect(stdout.startsWith("<!doctype html>")).toBe(true);
	});

	it("rejects an unknown format", async () => {
		const { code, stderr } = await exec([ORIGIN, "--format=xml"]);
		expect(code).toBe(2);
		expect(stderr).toContain(
			'--format must be terminal, json or html, got "xml"',
		);
	});

	it("exits 2 naming the URL when the target is unreachable", async () => {
		const agent = mockRoutes(ORIGIN, { "/": { status: 500 } });
		const { code, stderr } = await exec(["example.com"], {
			dispatcher: agent,
		});
		expect(code).toBe(2);
		expect(stderr).toContain("https://example.com");
	});

	it("turns unexpected errors into exit 2", async () => {
		const { code, stderr } = await exec(["ftp://example.com"]);
		expect(code).toBe(2);
		expect(stderr).not.toBe("");
	});

	describe("user agent", () => {
		async function seenAgent(
			argv: string[],
			env: Record<string, string | undefined>,
		) {
			let seen: string | undefined;
			const dispatcher = openSite({
				onRequest: (h) => {
					seen ??= h["user-agent"];
				},
			});
			await exec(argv, { env, dispatcher });
			return seen;
		}

		it("prefers the flag over the env var", async () => {
			expect(
				await seenAgent(["example.com", "--user-agent=Foo/1"], {
					AGENTCHECK_USER_AGENT: "Bar/2",
				}),
			).toBe("Foo/1");
		});

		it("uses the env var over the default", async () => {
			expect(
				await seenAgent(["example.com"], { AGENTCHECK_USER_AGENT: "Bar/2" }),
			).toBe("Bar/2");
		});

		it("sends the CLI version in the default User-Agent", async () => {
			expect(await seenAgent(["example.com"], {})).toBe(
				`AgentCheck/${cliPkg.version} (+https://agentcheck.dev)`,
			);
		});

		it("falls back to the default, treating an empty env var as unset", async () => {
			expect(
				await seenAgent(["example.com"], { AGENTCHECK_USER_AGENT: "" }),
			).toBe(defaultUserAgent(cliPkg.version));
		});
	});

	describe("color", () => {
		const ANSI = "\u001b[";

		it("emits ANSI on a TTY", async () => {
			expect((await exec(["example.com"], { isTTY: true })).stdout).toContain(
				ANSI,
			);
		});

		it("disables ANSI with NO_COLOR", async () => {
			const { stdout } = await exec(["example.com"], {
				isTTY: true,
				env: { NO_COLOR: "1" },
			});
			expect(stdout).not.toContain(ANSI);
		});

		it("emits no ANSI when not a TTY", async () => {
			expect((await exec(["example.com"])).stdout).not.toContain(ANSI);
		});
	});

	it("lists --no-browser in the help", async () => {
		const { stdout } = await exec(["--help"]);
		expect(stdout).toContain(
			"  --no-browser          Skip browser checks (Agentic Actionability)",
		);
	});

	it("skips browser checks with --no-browser without calling the renderer", async () => {
		const renderer = fakeRenderer(renderedPage());
		const { stdout } = await exec(["example.com", "--no-browser"], {
			renderer,
		});
		expect(stdout).toContain(
			`Skipped: Agentic Actionability (${DISABLED_REASON})`,
		);
		expect(renderer.calls).toHaveLength(0);
	});

	it("shows the unavailable reason of an injected renderer", async () => {
		const renderer = fakeRenderer({
			kind: "unavailable",
			reason: UNAVAILABLE_REASON,
		});
		const { stdout } = await exec(["example.com"], { renderer });
		expect(stdout).toContain(
			`Skipped: Agentic Actionability (${UNAVAILABLE_REASON})`,
		);
	});

	it("scores Agentic Actionability with a rendering renderer", async () => {
		const renderer = fakeRenderer(renderedPage());
		const { stdout } = await exec(["example.com"], { renderer });
		expect(stdout).not.toContain("Skipped: Agentic Actionability");
		expect(stdout).toContain("Browser: chrome 1.0 (rendered in 1.0 s)");
		expect(renderer.calls.length).toBeGreaterThan(0);
	});

	it("passes browserUserAgent only when a user agent is set", async () => {
		const plain = fakeRenderer(renderedPage());
		await exec(["example.com"], { renderer: plain });
		expect(plain.calls[0]?.userAgent).toBeUndefined();

		const viaFlag = fakeRenderer(renderedPage());
		await exec(["example.com", "--user-agent=Custom/1"], { renderer: viaFlag });
		expect(viaFlag.calls[0]?.userAgent).toBe("Custom/1");

		const viaEnv = fakeRenderer(renderedPage());
		await exec(["example.com"], {
			renderer: viaEnv,
			env: { AGENTCHECK_USER_AGENT: "Env/2" },
		});
		expect(viaEnv.calls[0]?.userAgent).toBe("Env/2");
	});
});
