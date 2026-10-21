import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RELEASE_PACKAGES } from "./release-packages.mjs";

/** A repo-shaped directory: every released package at `version`, except the overrides. */
function fixture(version: string, overrides: Record<string, string> = {}) {
	const root = mkdtempSync(join(tmpdir(), "set-version-"));
	for (const dir of RELEASE_PACKAGES) {
		mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(
			join(root, dir, "package.json"),
			JSON.stringify({ name: dir, version: overrides[dir] ?? version }),
		);
	}
	return root;
}

const versionOf = (root: string, dir: string) =>
	JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8")).version;

describe("set-version", () => {
	const SET = fileURLToPath(new URL("./set-version.mjs", import.meta.url));

	it("sets one version in every released package", () => {
		const root = fixture("0.0.0-dev", { "apps/web": "0.1.1" });
		const set = spawnSync(process.execPath, [SET, "0.1.2", root], {
			encoding: "utf8",
		});
		expect(set.status).toBe(0);
		for (const dir of RELEASE_PACKAGES)
			expect(versionOf(root, dir)).toBe("0.1.2");
	});

	it("accepts the placeholder with a prerelease suffix", () => {
		const root = fixture("0.1.2");
		const set = spawnSync(process.execPath, [SET, "0.0.0-dev", root], {
			encoding: "utf8",
		});
		expect(set.status).toBe(0);
		for (const dir of RELEASE_PACKAGES)
			expect(versionOf(root, dir)).toBe("0.0.0-dev");
	});

	it("rejects a version that is not X.Y.Z", () => {
		const set = spawnSync(process.execPath, [SET, "v0.1.2", fixture("0.1.0")], {
			encoding: "utf8",
		});
		expect(set.status).toBe(1);
	});
});
