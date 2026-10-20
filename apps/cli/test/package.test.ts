import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };

const read = (relative: string) =>
	readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("the published package", () => {
	it("ships the licence, identical to the repository's", () => {
		expect(pkg.files).toContain("LICENSE");
		expect(read("../LICENSE")).toBe(read("../../../LICENSE"));
	});

	it("is public and publishes with provenance", () => {
		expect(pkg.publishConfig).toEqual({ access: "public", provenance: true });
	});

	it("names its author, repository and bug tracker", () => {
		expect(pkg.author).toContain("Yan Fishel");
		expect(pkg.repository.url).toBe(
			"git+https://github.com/yanfishel/agentcheck.git",
		);
		expect(pkg.bugs).toBe("https://github.com/yanfishel/agentcheck/issues");
	});
});
