// Sets one version in every released package.json. The repository keeps the
// placeholder 0.0.0-dev; the release workflow sets the tag's version before
// it builds, so the images, the CLI and every report carry the real one.
// Usage: node scripts/set-version.mjs 0.1.2 [repo root]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_PACKAGES } from "./release-packages.mjs";

const [version = "", root = fileURLToPath(new URL("..", import.meta.url))] =
	process.argv.slice(2);
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
	console.error(`Version ${version || "(none)"} is not X.Y.Z`);
	process.exit(1);
}

for (const dir of RELEASE_PACKAGES) {
	const file = join(root, dir, "package.json");
	const text = readFileSync(file, "utf8");
	// A text edit, so the file's own formatting stays as it is.
	const next = text.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);
	if (next === text && !text.includes(`"version": "${version}"`)) {
		console.error(`${dir}/package.json has no version field`);
		process.exit(1);
	}
	writeFileSync(file, next);
	console.log(`${dir} ${version}`);
}
