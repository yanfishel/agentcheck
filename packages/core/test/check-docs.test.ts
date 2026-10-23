import { describe, expect, it } from "vitest";
import { CHECK_DOCS } from "../src/check-docs.ts";
import { CHECKS } from "../src/registry.ts";

describe("CHECK_DOCS", () => {
	it("documents every registered check and nothing else", () => {
		expect(Object.keys(CHECK_DOCS).sort()).toEqual(
			CHECKS.map((check) => check.id).sort(),
		);
	});

	it("gives each check a summary, a pass rule and an https source", () => {
		for (const [id, doc] of Object.entries(CHECK_DOCS)) {
			expect(doc.summary, id).toBeTruthy();
			expect(doc.pass, id).toBeTruthy();
			expect(doc.warn ?? doc.fail, `${id}: warn or fail`).toBeTruthy();
			expect(doc.sources.length, id).toBeGreaterThan(0);
			for (const source of doc.sources) {
				expect(source.href, id).toMatch(/^https:\/\//);
			}
		}
	});
});
