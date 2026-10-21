import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../bin/", import.meta.url));
const CI = join(BIN, "ci");
const DEPLOY = join(BIN, "deploy");

/** The healthy answer of `docker compose ps -a` after a deploy. */
const HEALTHY =
	"migrate exited 0\npostgres running 0\nweb running 0\nworker running 0";

/**
 * A stack directory with an .env, plus a fake `docker` on PATH that logs its
 * arguments and answers `compose ps` with `ps` (the stack's state).
 */
function stack(env = "A=1\nAGENTCHECK_VERSION=v0.0.1\nB=2\n", ps = HEALTHY) {
	const root = mkdtempSync(join(tmpdir(), "deploy-"));
	const dir = join(root, "stack");
	mkdirSync(join(dir, "bin"), { recursive: true });
	writeFileSync(join(dir, ".env"), env, { mode: 0o600 });
	const fakeBin = join(root, "fakebin");
	mkdirSync(fakeBin);
	const log = join(root, "docker.log");
	writeFileSync(
		join(fakeBin, "docker"),
		`#!/bin/sh\nprintf '%s\\n' "$*" >> "${log.replace(/\\/g, "/")}"\ncase "$*" in *" ps "*) printf '%s\\n' "$FAKE_PS" ;; esac\n`,
	);
	chmodSync(join(fakeBin, "docker"), 0o755);
	return {
		dir,
		log: () =>
			existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [],
		env: () => readFileSync(join(dir, ".env"), "utf8"),
		path: `${fakeBin}:${process.env.PATH ?? ""}`,
		ps,
	};
}

/** A tar of the given files (path -> content), as deploy reads it on stdin. */
function tarOf(files: Record<string, string>): Buffer {
	const src = mkdtempSync(join(tmpdir(), "deploy-src-"));
	for (const [file, content] of Object.entries(files)) {
		mkdirSync(join(src, file, ".."), { recursive: true });
		writeFileSync(join(src, file), content);
	}
	const tar = spawnSync("tar", ["-cf", "-", "-C", src, ...Object.keys(files)]);
	if (tar.status !== 0) throw new Error(tar.stderr.toString());
	return tar.stdout;
}

const STACK_FILES = {
	"docker-compose.yml": "services: {}\n",
	"seccomp-chromium.json": "{}\n",
	"bin/ci": "#!/bin/sh\necho ci\n",
	"bin/set-env": "#!/bin/sh\necho set-env\n",
	"bin/deploy": "#!/bin/sh\necho deploy\n",
};

function run(
	s: ReturnType<typeof stack>,
	tag: string,
	input: Buffer | string,
	extraEnv: Record<string, string> = {},
) {
	return spawnSync("sh", [DEPLOY, tag], {
		input,
		encoding: "utf8",
		env: {
			...process.env,
			PATH: s.path,
			STACK_DIR: s.dir,
			FAKE_PS: s.ps,
			DEPLOY_SETTLE_SECONDS: "0",
			...extraEnv,
		},
	});
}

describe("deploy", () => {
	it("installs the stack files, sets the tag and restarts the stack", () => {
		const s = stack();
		const result = run(s, "v1.2.3", tarOf(STACK_FILES));
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
		expect(readFileSync(join(s.dir, "docker-compose.yml"), "utf8")).toBe(
			"services: {}\n",
		);
		expect(readFileSync(join(s.dir, "bin", "deploy"), "utf8")).toContain(
			"echo deploy",
		);
		expect(s.env()).toBe("A=1\nAGENTCHECK_VERSION=v1.2.3\nB=2\n");
		expect(s.log()).toEqual([
			"compose pull --quiet",
			"compose up -d",
			"compose ps -a --format {{.Service}} {{.State}} {{.ExitCode}}",
		]);
		expect(result.stdout).toContain("deployed v1.2.3");
		expect(result.stdout).toContain("installed: docker-compose.yml");
	});

	it("adds the version line when .env has none", () => {
		const s = stack("A=1\n");
		expect(run(s, "v1.2.3", tarOf(STACK_FILES)).status).toBe(0);
		expect(s.env()).toBe("A=1\nAGENTCHECK_VERSION=v1.2.3\n");
	});

	it("rejects a tag that is not vX.Y.Z before touching anything", () => {
		const s = stack();
		for (const tag of ["1.2.3", "v1.2", "latest", "v1.2.3; rm -rf /", ""]) {
			const result = run(s, tag, tarOf(STACK_FILES));
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain("not vX.Y.Z");
		}
		expect(s.log()).toEqual([]);
		expect(s.env()).toContain("AGENTCHECK_VERSION=v0.0.1");
		expect(existsSync(join(s.dir, "docker-compose.yml"))).toBe(false);
	});

	it("rejects a file outside the stack and installs nothing", () => {
		const s = stack();
		const result = run(
			s,
			"v1.2.3",
			tarOf({ ...STACK_FILES, "bin/evil": "#!/bin/sh\n" }),
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("bin/evil is not a stack file");
		expect(existsSync(join(s.dir, "docker-compose.yml"))).toBe(false);
		expect(existsSync(join(s.dir, "bin", "evil"))).toBe(false);
		expect(s.env()).toContain("AGENTCHECK_VERSION=v0.0.1");
		expect(s.log()).toEqual([]);
	});

	it("fails when a service is not running afterwards, and shows the logs", () => {
		const s = stack(
			undefined,
			"migrate exited 1\nweb restarting 0\nworker running 0",
		);
		const result = run(s, "v1.2.3", tarOf(STACK_FILES));
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("deploy of v1.2.3 failed");
		expect(s.log().at(-1)).toBe("compose logs --tail 40 migrate web worker");
	});

	it("works with a partial tar (only the compose file) and no bin update", () => {
		const s = stack();
		const result = run(s, "v2.0.0", tarOf({ "docker-compose.yml": "x: 1\n" }));
		expect(result.status).toBe(0);
		expect(readFileSync(join(s.dir, "docker-compose.yml"), "utf8")).toBe(
			"x: 1\n",
		);
		expect(s.env()).toContain("AGENTCHECK_VERSION=v2.0.0");
	});
});

describe("ci (the forced command)", () => {
	const ci = (
		command: string | undefined,
		input = "",
		dir = join(tmpdir(), `does-not-exist-${process.pid}`),
	) =>
		spawnSync("sh", [CI], {
			input,
			encoding: "utf8",
			env: {
				...process.env,
				...(command === undefined ? {} : { SSH_ORIGINAL_COMMAND: command }),
				STACK_DIR: dir,
			},
		});

	it("refuses anything but set-env and deploy vX.Y.Z", () => {
		for (const command of [
			undefined,
			"",
			"sh",
			"deploy",
			"deploy latest",
			"set-env; id",
			"deploy v1.2.3 x",
		]) {
			const result = ci(command);
			expect(result.status, command).not.toBe(0);
		}
	});

	it("routes set-env to the script, on the stack's .env", () => {
		const s = stack("CLERK_SECRET_KEY=old\n");
		const bad = ci("set-env", "just a value\n", s.dir);
		expect(bad.status).not.toBe(0);
		expect(bad.stderr).toContain("a line without NAME=");
		const good = ci("set-env", "CLERK_SECRET_KEY=sk_new\n", s.dir);
		expect(good.status).toBe(0);
		expect(s.env()).toBe("CLERK_SECRET_KEY='sk_new'\n");
	});

	it("routes deploy to the script with the tag", () => {
		const result = ci("deploy v1.2.3");
		// deploy got the tag (it passes the tag check) and stops at the
		// missing stack directory.
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("does not exist");
	});
});
