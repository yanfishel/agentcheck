// PostToolUse hook: format the edited file with the project's local Biome.
// No-op when Biome is not installed yet or the file type is not handled by Biome.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const SUPPORTED = new Set([
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".json",
	".jsonc",
	".css",
]);

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const biomeBin = join(
	projectDir,
	"node_modules",
	"@biomejs",
	"biome",
	"bin",
	"biome",
);

let payload;
try {
	payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
	process.exit(0);
}

const file = payload?.tool_response?.filePath ?? payload?.tool_input?.file_path;
if (
	!file ||
	!SUPPORTED.has(extname(file).toLowerCase()) ||
	!existsSync(biomeBin)
) {
	process.exit(0);
}

spawnSync(
	process.execPath,
	[biomeBin, "check", "--write", "--no-errors-on-unmatched", file],
	{
		cwd: projectDir,
		stdio: "ignore",
	},
);
process.exit(0);
