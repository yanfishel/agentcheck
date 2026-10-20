import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(
	new URL("./check-release-version.mjs", import.meta.url),
);

const PACKAGES = [
	"packages/core",
	"packages/db",
	"apps/cli",
	"apps/web",
	"apps/worker",
];

/** A repo-shaped directory: every package at `version`, except the overrides. */
function fixture(version: string, overrides: Record<string, string> = {}) {
	const root = mkdtempSync(join(tmpdir(), "release-version-"));
	for (const dir of PACKAGES) {
		mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(
			join(root, dir, "package.json"),
			JSON.stringify({ name: dir, version: overrides[dir] ?? version }),
		);
	}
	return root;
}

const run = (tag: string, root: string) =>
	spawnSync(process.execPath, [SCRIPT, tag, root], { encoding: "utf8" });

describe("check-release-version", () => {
	it("accepts a tag equal to every package's version", () => {
		expect(run("v0.1.0", fixture("0.1.0")).status).toBe(0);
	});

	it("rejects a tag that differs, naming the package", () => {
		const result = run("v0.2.0", fixture("0.1.0"));
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			"Tag v0.2.0 does not match apps/web version 0.1.0",
		);
	});

	it("names the engine when only it lags behind", () => {
		const result = run(
			"v0.1.1",
			fixture("0.1.1", { "packages/core": "0.1.0" }),
		);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			"Tag v0.1.1 does not match packages/core version 0.1.0",
		);
	});

	it("checks the db and cli packages too", () => {
		for (const dir of ["packages/db", "apps/cli"]) {
			const result = run("v0.1.1", fixture("0.1.1", { [dir]: "0.1.0" }));
			expect(result.status).toBe(1);
			expect(result.stderr).toContain(`${dir} version 0.1.0`);
		}
	});

	it("rejects a CLI tag", () => {
		expect(run("cli-v0.1.0", fixture("0.1.0")).status).toBe(1);
	});
});

describe("set-version", () => {
	const SET = fileURLToPath(new URL("./set-version.mjs", import.meta.url));

	it("sets one version everywhere, so the release check passes", () => {
		const root = fixture("0.1.0", { "apps/web": "0.1.1" });
		const set = spawnSync(process.execPath, [SET, "0.1.2", root], {
			encoding: "utf8",
		});
		expect(set.status).toBe(0);
		expect(run("v0.1.2", root).status).toBe(0);
	});

	it("rejects a version that is not X.Y.Z", () => {
		const set = spawnSync(process.execPath, [SET, "v0.1.2", fixture("0.1.0")], {
			encoding: "utf8",
		});
		expect(set.status).toBe(1);
	});
});
