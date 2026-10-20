// Fails a release whose tag (vX.Y.Z) is not the version of every workspace
// package: the engine's version is shown in the footer, every report's
// tool.version and the CLI; the worker's in each audit's toolVersion.
// Usage: node scripts/check-release-version.mjs <tag> [repo root]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_PACKAGES } from "./release-packages.mjs";

const [tag = "", root = fileURLToPath(new URL("..", import.meta.url))] =
	process.argv.slice(2);

let failed = !/^v\d+\.\d+\.\d+$/.test(tag);
if (failed) console.error(`Tag ${tag || "(none)"} is not vX.Y.Z`);

for (const dir of RELEASE_PACKAGES) {
	const { version } = JSON.parse(
		readFileSync(join(root, dir, "package.json"), "utf8"),
	);
	if (tag !== `v${version}`) {
		console.error(`Tag ${tag} does not match ${dir} version ${version}`);
		failed = true;
	}
}
process.exit(failed ? 1 : 0);
