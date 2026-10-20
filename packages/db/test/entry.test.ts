import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

function collect(file: string, seen = new Set<string>()): Set<string> {
	if (seen.has(file)) return seen;
	seen.add(file);
	const source = readFileSync(file, "utf8");
	for (const m of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
		collect(resolve(dirname(file), m[1] as string), seen);
	}
	return seen;
}

describe("main entry", () => {
	it("does not pull PGlite into the module graph", () => {
		const files = collect(resolve(srcDir, "index.ts"));
		expect(files.size).toBeGreaterThan(1);
		for (const file of files) {
			expect(file).not.toMatch(/testing\.ts$/);
			const source = readFileSync(file, "utf8");
			expect(source).not.toMatch(/(from|import\()\s*"[^"]*pglite/i);
		}
	});
});
