import { readFileSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disabledRenderer } from "@agentcheck/core";
import { mockRoutes, mockSite } from "@agentcheck/core/test-helpers";
import type { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/main.js";

let cwd: string;
beforeEach(async () => {
	cwd = await mkdtemp(join(tmpdir(), "agentcheck-fix-"));
});
afterEach(async () => {
	await rm(cwd, { recursive: true, force: true });
});

async function exec(argv: string[], dispatcher?: MockAgent) {
	let stdout = "";
	let stderr = "";
	const code = await run(argv, {
		env: {},
		isTTY: false,
		stdout: (s) => {
			stdout += s;
		},
		stderr: (s) => {
			stderr += s;
		},
		dispatcher,
		renderer: disabledRenderer(),
		cwd,
	});
	return { code, stdout, stderr };
}

const site = () => mockSite("mixed");

describe("agentcheck fix", () => {
	it("writes the files the audit calls for, plus README.md and AGENT-PROMPT.md", async () => {
		const { agent, origin } = site();
		const r = await exec(["fix", origin], agent);
		expect(r.code).toBe(0);
		const names = await readdir(join(cwd, "agentcheck-fix"));
		expect(names).toContain("README.md");
		expect(names).toContain("AGENT-PROMPT.md");
		expect(names.length).toBeGreaterThan(2);
		expect(r.stderr).toContain("Auditing");
		expect(r.stderr).toContain("Reading pages");
		const readme = await readFile(
			join(cwd, "agentcheck-fix", "README.md"),
			"utf8",
		);
		expect(readme).toContain("AgentCheck fix files");
	});

	it("prints targets, skipped reasons and TODOs", async () => {
		const { agent, origin } = site();
		const r = await exec(["fix", origin, "--out=out"], agent);
		expect(r.code).toBe(0);
		expect(r.stdout).toMatch(/^Wrote:/);
		expect(r.stdout).toContain("README.md");
		expect(r.stdout).toContain(join(cwd, "out"));
		expect(r.stdout).toContain("To fill in by hand:");
	});

	it("--only skips the audit", async () => {
		const requests: string[] = [];
		const agent = mockRoutes("https://example.com", {
			"/": {
				status: 200,
				contentType: "text/html",
				body: "<html><head><title>Hi</title></head><body><h1>Hi</h1></body></html>",
				onRequest: () => requests.push("/"),
			},
			"/llms.txt": {
				status: 200,
				contentType: "text/plain",
				body: "# Hi",
				onRequest: () => requests.push("/llms.txt"),
			},
			"/llms-full.txt": {
				status: 200,
				contentType: "text/plain",
				body: "# Hi",
				onRequest: () => requests.push("/llms-full.txt"),
			},
			"/robots.txt": {
				status: 200,
				contentType: "text/plain",
				body: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /",
				onRequest: () => requests.push("/robots.txt"),
			},
		});
		const r = await exec(
			["fix", "https://example.com", "--only=robots", "--out=o"],
			agent,
		);
		expect(r.code).toBe(0);
		expect(r.stderr).not.toContain("Auditing");
		expect(requests.every((p) => p === "/" || p === "/robots.txt")).toBe(true);
		expect(requests).toContain("/robots.txt");
		expect(await readdir(join(cwd, "o"))).toContain("robots.txt");
	});

	it("--out= (empty) is rejected", async () => {
		const r = await exec(["fix", "https://example.com", "--out="]);
		expect(r.code).toBe(2);
		expect(r.stderr).toContain("--out");
	});

	it("--only rejects unknown kinds", async () => {
		const r = await exec(["fix", "https://example.com", "--only=robots,nope"]);
		expect(r.code).toBe(2);
		expect(r.stderr).toContain("nope");
	});

	it("refuses to overwrite, and --force overwrites", async () => {
		const { agent, origin } = site();
		await mkdir(join(cwd, "agentcheck-fix"));
		await writeFile(join(cwd, "agentcheck-fix", "README.md"), "mine");
		const r = await exec(["fix", origin], agent);
		expect(r.code).toBe(2);
		expect(r.stderr).toContain("README.md");
		expect(await readdir(join(cwd, "agentcheck-fix"))).toEqual(["README.md"]);
		const again = await exec(
			["fix", origin, "--force"],
			mockSite("mixed").agent,
		);
		expect(again.code).toBe(0);
		expect(
			await readFile(join(cwd, "agentcheck-fix", "README.md"), "utf8"),
		).not.toBe("mine");
	});

	it("says nothing to fix and creates no directory", async () => {
		const dir = new URL(
			"../../../packages/core/test/fixtures/sites/good/",
			import.meta.url,
		);
		const file = (n: string) => readFileSync(new URL(n, dir), "utf8");
		const origin = "https://good.example";
		const text = { status: 200, contentType: "text/plain" };
		const agent = mockRoutes(origin, {
			"/": { status: 200, contentType: "text/html", body: file("index.html") },
			"/index.md": { ...text, body: file("index.md") },
			"/llms.txt": { ...text, body: file("llms.txt") },
			"/llms-full.txt": { ...text, body: "# Lumen Notes\n\nFull text." },
			"/robots.txt": { ...text, body: file("robots.txt") },
		});
		const r = await exec(["fix", origin], agent);
		expect(r.code).toBe(0);
		expect(r.stdout).toMatch(/^Nothing to fix: /);
		expect(await readdir(cwd)).toEqual([]);
	});

	it("lists skipped kinds with reasons and writes nothing when all are skipped", async () => {
		const agent = mockRoutes("https://example.com", {
			"/": { status: 200, contentType: "text/html", body: "<html></html>" },
			"/robots.txt": {
				status: 200,
				contentType: "text/plain",
				body: "User-agent: *\nContent-Signal: search=yes\nAllow: /",
			},
		});
		const r = await exec(
			["fix", "https://example.com", "--only=robots"],
			agent,
		);
		expect(r.code).toBe(0);
		expect(r.stdout).toContain("Skipped:");
		expect(r.stdout).toContain("robots:");
		expect(await readdir(cwd)).toEqual([]);
	});

	it("exits 2 when nothing was written because an input could not be read", async () => {
		const agent = mockRoutes("https://example.com", {
			"/": { status: 200, contentType: "text/html", body: "<html></html>" },
			"/robots.txt": { status: 503, contentType: "text/plain", body: "busy" },
		});
		const r = await exec(
			["fix", "https://example.com", "--only=robots"],
			agent,
		);
		expect(r.code).toBe(2);
		expect(r.stdout).toContain("Nothing written.");
		expect(r.stdout).toContain(
			"robots: robots.txt could not be read (HTTP 503)",
		);
		expect(await readdir(cwd)).toEqual([]);
	});

	it("reports an unreachable site with exit 2", async () => {
		const r = await exec(
			["fix", "https://example.com"],
			mockRoutes("https://other.example", {}),
		);
		expect(r.code).toBe(2);
	});

	it("needs a URL; fix --help prints its own help; main --help mentions fix", async () => {
		expect((await exec(["fix"])).code).toBe(2);
		const h = await exec(["fix", "--help"]);
		expect(h.code).toBe(0);
		expect(h.stdout).toContain("--only=KINDS");
		expect((await exec(["--help"])).stdout).toContain("agentcheck fix");
	});
});
